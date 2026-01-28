import * as THREE from 'three';
import paper from 'paper';
import type { ProfileSettings, GenerationResult } from '../types';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { isValidPath, isValidCompoundPath } from './paperSafety';

export function generateMesh(
  compoundPath: paper.CompoundPath,
  settings: ProfileSettings
): THREE.Mesh {
  // Validate input before processing
  if (!isValidCompoundPath(compoundPath)) {
    throw new Error('Invalid compound path passed to mesh generator');
  }

  // Convert Paper.js path to THREE.js Shape
  const shapes = pathToShapes(compoundPath);

  if (shapes.length === 0) {
    throw new Error('No valid shapes generated from SVG geometry');
  }

  // Create extruded geometry
  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: settings.thickness,
    bevelEnabled: settings.bevel > 0,
    bevelThickness: settings.bevel,
    bevelSize: settings.bevel,
    bevelSegments: 1,
  };

  let geometry: THREE.BufferGeometry;

  try {
    if (shapes.length === 1) {
      geometry = new THREE.ExtrudeGeometry(shapes[0], extrudeSettings);
    } else {
      // Merge multiple shapes
      const geometries = shapes.map(shape => new THREE.ExtrudeGeometry(shape, extrudeSettings));
      geometry = mergeGeometries(geometries);
    }
  } catch (error) {
    throw new Error(
      'Failed to extrude geometry. ' +
      'The shape may be too complex or contain invalid curves. ' +
      'Try simplifying the SVG.'
    );
  }

  // Add base if needed
  if (settings.baseThickness > 0) {
    try {
      const baseGeometry = createBase(compoundPath, settings.baseThickness);
      geometry = mergeGeometries([geometry, baseGeometry]);
    } catch (error) {
      console.warn('Failed to create base, using main geometry only');
    }
  }

  // Center the geometry
  geometry.center();
  geometry.computeVertexNormals();

  // Create material
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    metalness: 0.1,
    roughness: 0.6,
  });

  return new THREE.Mesh(geometry, material);
}

function pathToShapes(compoundPath: paper.CompoundPath): THREE.Shape[] {
  const shapes: THREE.Shape[] = [];

  if (!compoundPath.children || compoundPath.children.length === 0) {
    return shapes;
  }

  // Process each child path
  compoundPath.children.forEach((child) => {
    if (!(child instanceof paper.Path)) return;

    const path = child as paper.Path;

    // CRITICAL: Validate path before accessing segments
    if (!isValidPath(path)) {
      console.warn('Skipping invalid path in mesh generation');
      return;
    }

    if (!path.segments || path.segments.length < 3) return;

    try {
      const shape = new THREE.Shape();
      let first = true;

      path.segments.forEach((segment) => {
        // CRITICAL: Check for null segment (causes getDirectedAngle crash)
        if (!segment || !segment.point) {
          console.warn('Null segment detected, skipping');
          return;
        }

        const point = segment.point;

        // Validate coordinates
        if (isNaN(point.x) || isNaN(point.y)) {
          console.warn('NaN coordinates detected, skipping segment');
          return;
        }

        if (first) {
          shape.moveTo(point.x, -point.y); // Flip Y for THREE.js coordinate system
          first = false;
        } else {
          // Handle curves if present
          if (segment.handleIn && segment.handleIn.length > 0) {
            const segmentIndex = path.segments.indexOf(segment);
            const prevSeg = segmentIndex > 0 ? path.segments[segmentIndex - 1] : null;

            if (prevSeg && prevSeg.point && prevSeg.handleOut) {
              // Validate handle coordinates
              if (
                !isNaN(prevSeg.point.x) && !isNaN(prevSeg.point.y) &&
                !isNaN(prevSeg.handleOut.x) && !isNaN(prevSeg.handleOut.y) &&
                !isNaN(segment.handleIn.x) && !isNaN(segment.handleIn.y)
              ) {
                shape.bezierCurveTo(
                  prevSeg.point.x + prevSeg.handleOut.x,
                  -(prevSeg.point.y + prevSeg.handleOut.y),
                  point.x + segment.handleIn.x,
                  -(point.y + segment.handleIn.y),
                  point.x,
                  -point.y
                );
              } else {
                shape.lineTo(point.x, -point.y);
              }
            } else {
              shape.lineTo(point.x, -point.y);
            }
          } else {
            shape.lineTo(point.x, -point.y);
          }
        }
      });

      // Check if this is a hole (clockwise vs counter-clockwise)
      const isHole = path.clockwise;

      if (isHole && shapes.length > 0) {
        // Add as hole to the last shape
        shapes[shapes.length - 1].holes.push(shape);
      } else {
        shapes.push(shape);
      }
    } catch (error) {
      console.warn('Failed to convert path to shape:', error);
      // Continue with other paths
    }
  });

  return shapes;
}

function createBase(
  compoundPath: paper.CompoundPath,
  thickness: number
): THREE.BufferGeometry {
  // Validate input
  if (!isValidCompoundPath(compoundPath)) {
    throw new Error('Invalid compound path for base creation');
  }

  const shapes = pathToShapes(compoundPath);

  if (shapes.length === 0) {
    throw new Error('No shapes for base creation');
  }

  const baseSettings: THREE.ExtrudeGeometryOptions = {
    depth: thickness,
    bevelEnabled: false,
  };

  if (shapes.length === 1) {
    return new THREE.ExtrudeGeometry(shapes[0], baseSettings);
  } else {
    const geometries = shapes.map(shape => new THREE.ExtrudeGeometry(shape, baseSettings));
    return mergeGeometries(geometries);
  }
}

function mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = new THREE.BufferGeometry();

  let totalVertices = 0;
  let totalIndices = 0;

  // Calculate total sizes
  geometries.forEach(geo => {
    const pos = geo.getAttribute('position');
    if (pos) totalVertices += pos.count;

    const idx = geo.getIndex();
    if (idx) totalIndices += idx.count;
  });

  // Allocate arrays
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;
  let currentVertex = 0;

  // Merge geometries
  geometries.forEach(geo => {
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const idx = geo.getIndex();

    if (pos) {
      positions.set(pos.array as Float32Array, vertexOffset * 3);
      if (norm) {
        normals.set(norm.array as Float32Array, vertexOffset * 3);
      }
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices[indexOffset + i] = idx.array[i] + currentVertex;
      }
      indexOffset += idx.count;
    }

    currentVertex += pos ? pos.count : 0;
    vertexOffset += pos ? pos.count : 0;
  });

  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));

  return merged;
}

export async function exportSTL(mesh: THREE.Mesh): Promise<Blob> {
  const exporter = new STLExporter();
  const result = exporter.parse(mesh, { binary: true });

  if (result instanceof ArrayBuffer) {
    return new Blob([result], { type: 'application/octet-stream' });
  } else {
    // Text STL
    return new Blob([result], { type: 'text/plain' });
  }
}

export async function generate3DModel(
  compoundPath: paper.CompoundPath,
  settings: ProfileSettings
): Promise<GenerationResult> {
  const startTime = performance.now();

  try {
    // Validate input before mesh generation
    if (!isValidCompoundPath(compoundPath)) {
      throw new Error('Invalid geometry passed to 3D generator');
    }

    // Generate mesh
    const mesh = generateMesh(compoundPath, settings);

    // Export STL
    const stlBlob = await exportSTL(mesh);

    const processingTime = performance.now() - startTime;

    return {
      success: true,
      stlBlob,
      processingTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during mesh generation',
      processingTime: performance.now() - startTime,
    };
  }
}
