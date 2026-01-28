import paper from 'paper';
import type { PreflightResult, PreflightIssue, ProfileSettings } from '../types';

// Initialize Paper.js in memory-only mode
paper.setup(new paper.Size(1000, 1000));

export interface ParsedSVG {
  paths: paper.Path[];
  bounds: paper.Rectangle;
  compoundPath: paper.CompoundPath | null;
}

/**
 * Validate that a Paper.js path is safe to use in geometry operations
 */
function isValidPath(path: paper.Path): boolean {
  if (!path || !path.segments) return false;
  if (path.segments.length < 2) return false;

  // Check for null segments (this is what causes the getDirectedAngle crash)
  for (const segment of path.segments) {
    if (!segment || !segment.point) return false;
    if (isNaN(segment.point.x) || isNaN(segment.point.y)) return false;
  }

  // Check for valid bounds
  const bounds = path.bounds;
  if (!bounds || isNaN(bounds.width) || isNaN(bounds.height)) return false;
  if (bounds.width === 0 && bounds.height === 0) return false;

  // Check for zero-length paths
  if (path.length === 0 || isNaN(path.length)) return false;

  return true;
}

/**
 * Safely get intersections without crashing on degenerate paths
 */
function safeGetIntersections(path: paper.Path): boolean {
  if (!isValidPath(path)) return false;

  try {
    const intersections = path.getIntersections(path);
    return intersections && intersections.length > 0;
  } catch (error) {
    // Paper.js can throw on degenerate geometries
    console.warn('Failed to check intersections:', error);
    return false;
  }
}

/**
 * Safely simplify a path
 */
function safeSimplify(path: paper.Path, tolerance: number): paper.Path {
  if (!isValidPath(path) || tolerance <= 0) return path;

  try {
    path.simplify(tolerance);
    return path;
  } catch (error) {
    console.warn('Failed to simplify path:', error);
    return path;
  }
}

/**
 * Safely apply offset to a path
 */
function safeOffset(path: paper.Path, offset: number): paper.Path | null {
  if (!isValidPath(path) || Math.abs(offset) < 0.001) return path;

  try {
    const offsetPath = (path as any).offsetPath(offset);
    if (offsetPath && isValidPath(offsetPath as paper.Path)) {
      return offsetPath as paper.Path;
    }
    return path; // fallback to original if offset fails
  } catch (error) {
    console.warn('Failed to offset path:', error);
    return path; // fallback to original
  }
}

/**
 * Safely unite compound paths
 */
function safeUnite(compound: paper.CompoundPath): paper.CompoundPath | null {
  if (!compound || !compound.children || compound.children.length === 0) {
    return null;
  }

  try {
    const united = compound.unite(compound);
    return united as paper.CompoundPath;
  } catch (error) {
    console.warn('Failed to unite paths:', error);
    return compound; // fallback to non-united compound
  }
}

export function parseSVG(svgString: string): ParsedSVG {
  // Create a temporary project for this parse
  const tempProject = new paper.Project(new paper.Size(1000, 1000));

  try {
    // Import SVG into Paper.js
    const imported = tempProject.importSVG(svgString);

    if (!imported) {
      throw new Error('Failed to parse SVG - invalid SVG format');
    }

    // Collect all path items
    const allPaths: paper.Path[] = [];

    function collectPaths(item: paper.Item) {
      if (item instanceof paper.Path) {
        const path = item as paper.Path;
        allPaths.push(path.clone() as paper.Path);
      } else if (item instanceof paper.CompoundPath) {
        // Flatten compound paths into individual paths
        item.children.forEach((child) => {
          if (child instanceof paper.Path) {
            allPaths.push(child.clone() as paper.Path);
          }
        });
      } else if (item instanceof paper.Group || item instanceof paper.Layer) {
        item.children.forEach(collectPaths);
      }
    }

    collectPaths(imported);

    // Filter to only valid paths
    const validPaths = allPaths.filter(isValidPath);

    if (validPaths.length === 0) {
      throw new Error(
        'SVG contains no valid closed shapes. ' +
        'Please convert text to paths, expand strokes, and remove invisible objects.'
      );
    }

    // Calculate bounds
    const bounds = validPaths.reduce((acc, path) => {
      return acc ? acc.unite(path.bounds) : path.bounds;
    }, null as paper.Rectangle | null);

    // Create a compound path from all valid paths
    const compoundPath = new paper.CompoundPath({
      children: validPaths.map(p => p.clone())
    });

    return {
      paths: validPaths,
      bounds: bounds || new paper.Rectangle(0, 0, 100, 100),
      compoundPath,
    };
  } finally {
    // Clean up temporary project
    tempProject.remove();
  }
}

export function preflightCheck(
  parsed: ParsedSVG,
  settings: ProfileSettings
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const { paths, bounds } = parsed;

  // Validate we have paths to work with
  if (paths.length === 0) {
    issues.push({
      severity: 'error',
      message: 'No valid paths found in SVG',
      detail: 'The SVG does not contain any renderable shapes',
      suggestedFix: 'Ensure your SVG contains filled paths or shapes (not just strokes or text)',
    });

    return {
      passed: false,
      issues,
      stats: {
        pathCount: 0,
        closedPaths: 0,
        openPaths: 0,
        totalPoints: 0,
        boundingBox: { width: 0, height: 0 },
        hasIntersections: false,
        tinyIslandsCount: 0,
      },
    };
  }

  // Count paths and points
  let closedPaths = 0;
  let openPaths = 0;
  let totalPoints = 0;
  let hasIntersections = false;
  let invalidPathCount = 0;

  paths.forEach((path) => {
    if (!isValidPath(path)) {
      invalidPathCount++;
      return;
    }

    if (path.closed) {
      closedPaths++;
    } else {
      openPaths++;
    }
    totalPoints += path.segments.length;
  });

  // Check for invalid/degenerate paths
  if (invalidPathCount > 0) {
    issues.push({
      severity: 'error',
      message: `Found ${invalidPathCount} invalid or degenerate path${invalidPathCount > 1 ? 's' : ''}`,
      detail: 'Paths with zero length, NaN coordinates, or null segments cannot be processed',
      suggestedFix: 'Clean up your SVG in an editor: remove invisible objects, fix broken paths, simplify geometry',
    });
  }

  // Check for open paths
  if (openPaths > 0) {
    issues.push({
      severity: 'warning',
      message: `Found ${openPaths} open path${openPaths > 1 ? 's' : ''}`,
      detail: 'Open paths will be automatically closed during processing, which may produce unexpected results',
      suggestedFix: 'In your SVG editor: close all paths, convert strokes to fills, convert text to paths',
    });
  }

  // Require at least some closed paths for most operations
  if (closedPaths === 0) {
    issues.push({
      severity: 'error',
      message: 'No closed paths found',
      detail: 'Extrusion requires closed shapes',
      suggestedFix: 'Convert strokes to fills, close all open paths, or use shapes instead of lines',
    });
  }

  // Check for excessive node count
  const avgPointsPerPath = totalPoints / paths.length;
  if (avgPointsPerPath > 500) {
    issues.push({
      severity: 'warning',
      message: `High node count detected (avg ${Math.round(avgPointsPerPath)} points per path)`,
      detail: 'Complex paths may slow down processing or cause browser memory issues',
      suggestedFix: `Increase simplify tolerance to ${(settings.simplifyTolerance * 2).toFixed(2)}mm or higher`,
    });
  }

  // Check for self-intersections (limited check to avoid performance issues)
  const pathsToCheck = paths.slice(0, Math.min(3, paths.length));
  for (const path of pathsToCheck) {
    if (safeGetIntersections(path)) {
      hasIntersections = true;
      break;
    }
  }

  if (hasIntersections) {
    issues.push({
      severity: 'info',
      message: 'Self-intersections detected in paths',
      detail: 'Some paths cross over themselves',
      suggestedFix: 'Union operations will attempt to resolve this automatically',
    });
  }

  // Check for tiny features
  let tinyIslandsCount = 0;
  paths.forEach((path) => {
    if (isValidPath(path) && Math.abs(path.area) < settings.removeIslandsThreshold) {
      tinyIslandsCount++;
    }
  });

  if (tinyIslandsCount > 0) {
    issues.push({
      severity: 'info',
      message: `${tinyIslandsCount} tiny feature${tinyIslandsCount > 1 ? 's' : ''} will be removed`,
      detail: `Features smaller than ${settings.removeIslandsThreshold}mm²`,
    });
  }

  // Check bounding box size
  const maxDimension = Math.max(bounds.width, bounds.height);
  if (maxDimension > 300) {
    issues.push({
      severity: 'warning',
      message: `Large SVG detected (${Math.round(maxDimension)}mm max dimension)`,
      detail: 'This may exceed typical print bed sizes (most printers are 200-300mm)',
      suggestedFix: 'Scale down your SVG before uploading',
    });
  }

  if (maxDimension < 5) {
    issues.push({
      severity: 'warning',
      message: `Very small SVG detected (${maxDimension.toFixed(1)}mm max dimension)`,
      detail: 'Features may be too small to print reliably at this scale',
      suggestedFix: 'Scale up your SVG before uploading',
    });
  }

  // Determine if preflight passed
  const hasErrors = issues.some((i) => i.severity === 'error');
  const passed = !hasErrors;

  return {
    passed,
    issues,
    stats: {
      pathCount: paths.length,
      closedPaths,
      openPaths,
      totalPoints,
      boundingBox: {
        width: bounds.width,
        height: bounds.height,
      },
      hasIntersections,
      tinyIslandsCount,
    },
  };
}

export function processPaths(
  parsed: ParsedSVG,
  settings: ProfileSettings
): paper.CompoundPath {
  const { paths } = parsed;

  // Filter and validate paths before processing
  const validPaths = paths.filter(isValidPath);

  if (validPaths.length === 0) {
    throw new Error('No valid paths to process after validation');
  }

  // Clone and process each path
  const processedPaths: paper.Path[] = [];

  for (const p of validPaths) {
    let path = p.clone() as paper.Path;

    // Close open paths
    if (!path.closed) {
      try {
        path.closePath();
      } catch (error) {
        console.warn('Failed to close path, skipping:', error);
        continue;
      }
    }

    // Simplify if tolerance > 0
    if (settings.simplifyTolerance > 0) {
      path = safeSimplify(path, settings.simplifyTolerance);
    }

    // Only keep if still valid after processing
    if (isValidPath(path)) {
      processedPaths.push(path);
    }
  }

  if (processedPaths.length === 0) {
    throw new Error('All paths became invalid during processing');
  }

  // Apply offset if needed (skip if zero or near-zero)
  let finalPaths = processedPaths;
  if (Math.abs(settings.offset) > 0.001) {
    const offsetPaths: paper.Path[] = [];

    for (const path of processedPaths) {
      const offsetPath = safeOffset(path, settings.offset);
      if (offsetPath && isValidPath(offsetPath)) {
        offsetPaths.push(offsetPath);
      }
    }

    // Only use offset results if we got valid paths back
    if (offsetPaths.length > 0) {
      finalPaths = offsetPaths;
    } else {
      console.warn('Offset operation failed for all paths, using non-offset paths');
    }
  }

  // Remove tiny islands
  if (settings.removeIslandsThreshold > 0) {
    finalPaths = finalPaths.filter((path) => {
      return isValidPath(path) && Math.abs(path.area) >= settings.removeIslandsThreshold;
    });
  }

  if (finalPaths.length === 0) {
    throw new Error('No paths remaining after filtering (all removed as tiny islands or invalid)');
  }

  // Union all paths into a single compound path
  const compound = new paper.CompoundPath({
    children: finalPaths.map(p => p.clone()),
  });

  // Safely unite to resolve overlaps
  const united = safeUnite(compound);

  if (!united) {
    throw new Error('Failed to unite paths - geometry may be too complex or degenerate');
  }

  return united;
}
