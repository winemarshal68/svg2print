import * as THREE from 'three';
import paper from 'paper';
import type { ProfileSettings, GenerationResult } from '../types';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export function generateMesh(
  compoundPath: paper.CompoundPath,
  settings: ProfileSettings
): THREE.Mesh {
  // Convert Paper.js path to THREE.js Shape
  const shapes = pathToShapes(compoundPath);

  if (shapes.length === 0) {
    throw new Error('No valid shapes generated from SVG');
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

  if (shapes.length === 1) {
    geometry = new THREE.ExtrudeGeometry(shapes[0], extrudeSettings);
  } else {
    // Merge multiple shapes
    const geometries = shapes.map(shape => new THREE.ExtrudeGeometry(shape, extrudeSettings));
    geometry = mergeGeometries(geometries);
  }

  // Add base if needed
  if (settings.baseThickness > 0) {
    const baseGeometry = createBase(compoundPath, settings.baseThickness);
    geometry = mergeGeometries([geometry, baseGeometry]);
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
    if (!path.segments || path.segments.length < 3) return;

    const shape = new THREE.Shape();
    let first = true;

    path.segments.forEach((segment) => {
      const point = segment.point;
      if (first) {
        shape.moveTo(point.x, -point.y); // Flip Y for THREE.js coordinate system
        first = false;
      } else {
        // Handle curves if present
        if (segment.handleIn.length > 0) {
          const prevSeg = path.segments[path.segments.indexOf(segment) - 1];
          if (prevSeg) {
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
  });

  return shapes;
}

function createBase(
  compoundPath: paper.CompoundPath,
  thickness: number
): THREE.BufferGeometry {
  const shapes = pathToShapes(compoundPath);

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
