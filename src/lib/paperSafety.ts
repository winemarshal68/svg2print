/**
 * Centralized Paper.js safety layer
 * ALL Paper.js geometry operations MUST go through these helpers
 * to prevent crashes from null segments, NaN coordinates, or degenerate geometry
 */

import paper from 'paper';

/**
 * Validate that a Paper.js path is safe to use in geometry operations
 * This checks for the exact conditions that cause getDirectedAngle crashes
 */
export function isValidPath(path: any): path is paper.Path {
  if (!path) return false;

  // Check if it's actually a path
  if (!(path instanceof paper.Path)) return false;

  // Must have segments
  if (!path.segments || !Array.isArray(path.segments)) return false;
  if (path.segments.length < 2) return false;

  // Check for null segments (this is what causes the getDirectedAngle crash)
  for (const segment of path.segments) {
    if (!segment || !segment.point) return false;

    // Check for NaN coordinates
    const x = segment.point.x;
    const y = segment.point.y;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (isNaN(x) || isNaN(y)) return false;
    if (!isFinite(x) || !isFinite(y)) return false;

    // Check handle points if they exist
    if (segment.handleIn) {
      if (isNaN(segment.handleIn.x) || isNaN(segment.handleIn.y)) return false;
    }
    if (segment.handleOut) {
      if (isNaN(segment.handleOut.x) || isNaN(segment.handleOut.y)) return false;
    }
  }

  // Check for valid bounds
  const bounds = path.bounds;
  if (!bounds) return false;
  if (isNaN(bounds.width) || isNaN(bounds.height)) return false;
  if (!isFinite(bounds.width) || !isFinite(bounds.height)) return false;

  // Zero-dimension paths can cause issues
  if (bounds.width === 0 && bounds.height === 0) return false;

  // Check for zero-length paths
  if (typeof path.length !== 'number' || path.length === 0 || isNaN(path.length)) {
    return false;
  }

  return true;
}

/**
 * Validate CompoundPath
 */
export function isValidCompoundPath(compound: any): compound is paper.CompoundPath {
  if (!compound) return false;
  if (!(compound instanceof paper.CompoundPath)) return false;
  if (!compound.children || compound.children.length === 0) return false;

  // All children must be valid paths
  for (const child of compound.children) {
    if (child instanceof paper.Path) {
      if (!isValidPath(child)) return false;
    }
  }

  return true;
}

/**
 * Execute a Paper.js operation with full validation before AND after
 * Returns null on any failure (never throws)
 */
export function safePaperOp<T>(
  operation: () => T,
  operationName: string
): T | null {
  try {
    const result = operation();

    // Validate result if it's a path or compound path
    if (result instanceof paper.Path) {
      if (!isValidPath(result)) {
        console.warn(`${operationName} produced invalid path`);
        return null;
      }
    } else if (result instanceof paper.CompoundPath) {
      if (!isValidCompoundPath(result)) {
        console.warn(`${operationName} produced invalid compound path`);
        return null;
      }
    }

    return result;
  } catch (error) {
    console.warn(`${operationName} failed:`, error);
    return null;
  }
}

/**
 * Safe getIntersections - validates input and wraps in try/catch
 */
export function safeGetIntersections(path: paper.Path): paper.CurveLocation[] {
  if (!isValidPath(path)) {
    return [];
  }

  return safePaperOp(
    () => path.getIntersections(path),
    'getIntersections'
  ) || [];
}

/**
 * Safe simplify - validates before and after
 */
export function safeSimplify(path: paper.Path, tolerance: number): paper.Path {
  if (!isValidPath(path) || tolerance <= 0) {
    return path;
  }

  const result = safePaperOp(
    () => {
      path.simplify(tolerance);
      return path;
    },
    'simplify'
  );

  return result || path;
}

/**
 * Safe offset - validates before and after
 */
export function safeOffset(path: paper.Path, offset: number): paper.Path | null {
  if (!isValidPath(path)) {
    return null;
  }

  if (Math.abs(offset) < 0.001) {
    return path; // Skip near-zero offsets
  }

  const result = safePaperOp(
    () => {
      const offsetPath = (path as any).offsetPath(offset);
      return offsetPath;
    },
    'offsetPath'
  );

  // Return original if offset fails
  return result || path;
}

/**
 * Safe closePath - validates before and after
 */
export function safeClosePath(path: paper.Path): paper.Path {
  if (!isValidPath(path)) {
    return path;
  }

  if (path.closed) {
    return path; // Already closed
  }

  const result = safePaperOp(
    () => {
      path.closePath();
      return path;
    },
    'closePath'
  );

  return result || path;
}

/**
 * Safe unite - validates inputs and output
 */
export function safeUnite(
  path1: paper.PathItem,
  path2: paper.PathItem
): paper.PathItem | null {
  // Validate inputs
  if (path1 instanceof paper.Path && !isValidPath(path1)) {
    return null;
  }
  if (path2 instanceof paper.Path && !isValidPath(path2)) {
    return null;
  }
  if (path1 instanceof paper.CompoundPath && !isValidCompoundPath(path1)) {
    return null;
  }
  if (path2 instanceof paper.CompoundPath && !isValidCompoundPath(path2)) {
    return null;
  }

  return safePaperOp(
    () => path1.unite(path2),
    'unite'
  );
}

/**
 * Safe compound path creation and unification
 */
export function safeCreateAndUniteCompound(paths: paper.Path[]): paper.CompoundPath | null {
  // Filter to only valid paths
  const validPaths = paths.filter(isValidPath);

  if (validPaths.length === 0) {
    return null;
  }

  // Create compound path
  const compound = safePaperOp(
    () => new paper.CompoundPath({
      children: validPaths.map(p => p.clone())
    }),
    'CompoundPath creation'
  );

  if (!compound) {
    return null;
  }

  // Unite it with itself to resolve overlaps
  const united = safeUnite(compound, compound);

  if (united instanceof paper.CompoundPath) {
    return united;
  }

  // Fallback to non-united compound
  return compound;
}

/**
 * Safe path cloning with validation
 */
export function safeClone(path: paper.Path): paper.Path | null {
  if (!isValidPath(path)) {
    return null;
  }

  return safePaperOp(
    () => path.clone() as paper.Path,
    'clone'
  );
}

/**
 * Collect all paths from an item tree with validation
 */
export function collectValidPaths(item: paper.Item): paper.Path[] {
  const paths: paper.Path[] = [];

  function collect(item: paper.Item) {
    if (item instanceof paper.Path) {
      if (isValidPath(item)) {
        const cloned = safeClone(item);
        if (cloned) {
          paths.push(cloned);
        }
      }
    } else if (item instanceof paper.CompoundPath) {
      // Flatten compound paths into individual paths
      item.children.forEach((child) => {
        if (child instanceof paper.Path && isValidPath(child)) {
          const cloned = safeClone(child);
          if (cloned) {
            paths.push(cloned);
          }
        }
      });
    } else if (item instanceof paper.Group || item instanceof paper.Layer) {
      item.children.forEach(collect);
    }
  }

  collect(item);
  return paths;
}
