import paper from 'paper';
import type { PreflightResult, PreflightIssue, ProfileSettings } from '../types';
import {
  isValidPath,
  safeGetIntersections,
  safeSimplify,
  safeOffset,
  safeClosePath,
  safeCreateAndUniteCompound,
  collectValidPaths,
} from './paperSafety';

// Initialize Paper.js in memory-only mode
paper.setup(new paper.Size(1000, 1000));

export interface ParsedSVG {
  paths: paper.Path[];
  bounds: paper.Rectangle;
  compoundPath: paper.CompoundPath | null;
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

    // Collect all valid paths using safety helper
    const validPaths = collectValidPaths(imported);

    if (validPaths.length === 0) {
      throw new Error(
        'SVG contains no valid shapes. ' +
        'Please convert text to paths, expand strokes to fills, and remove invisible objects.'
      );
    }

    // Calculate bounds safely
    let bounds: paper.Rectangle | null = null;
    for (const path of validPaths) {
      if (isValidPath(path) && path.bounds) {
        bounds = bounds ? bounds.unite(path.bounds) : path.bounds;
      }
    }

    // Create a compound path from all valid paths
    const compoundPath = safeCreateAndUniteCompound(validPaths);

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
      suggestedFix: 'Clean up your SVG: remove invisible objects, fix broken paths, simplify geometry in your editor',
    });
  }

  // Check for open paths
  if (openPaths > 0) {
    issues.push({
      severity: 'warning',
      message: `Found ${openPaths} open path${openPaths > 1 ? 's' : ''}`,
      detail: 'Open paths will be automatically closed, which may produce unexpected results',
      suggestedFix: 'In your SVG editor: close all paths, convert strokes to fills, convert text to paths',
    });
  }

  // Require at least some closed paths for most operations
  if (closedPaths === 0 && openPaths > 0) {
    issues.push({
      severity: 'error',
      message: 'No closed paths found - only strokes or open paths',
      detail: 'Extrusion requires closed filled shapes, not just outlines',
      suggestedFix: 'Convert strokes to fills, close all open paths, or use filled shapes instead of strokes',
    });
  }

  // Check for excessive node count
  if (paths.length > 0) {
    const avgPointsPerPath = totalPoints / paths.length;
    if (avgPointsPerPath > 500) {
      issues.push({
        severity: 'warning',
        message: `High node count detected (avg ${Math.round(avgPointsPerPath)} points per path)`,
        detail: 'Complex paths may slow down processing or cause browser memory issues',
        suggestedFix: `Increase simplify tolerance to ${(settings.simplifyTolerance * 2).toFixed(2)}mm or higher`,
      });
    }
  }

  // Check for self-intersections using SAFE helper (limited check to avoid performance issues)
  const pathsToCheck = paths.slice(0, Math.min(3, paths.length));
  for (const path of pathsToCheck) {
    if (isValidPath(path)) {
      const intersections = safeGetIntersections(path);
      if (intersections.length > 0) {
        hasIntersections = true;
        break;
      }
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

  // Filter to only valid paths
  const validPaths = paths.filter(isValidPath);

  if (validPaths.length === 0) {
    throw new Error(
      'No valid paths to process. ' +
      'The SVG geometry became invalid. ' +
      'Please clean up the SVG file in an editor.'
    );
  }

  // Process each path using ONLY safe operations
  const processedPaths: paper.Path[] = [];

  for (const path of validPaths) {
    // Close open paths using safe helper
    let processed = safeClosePath(path);

    // Validate after closing
    if (!isValidPath(processed)) {
      console.warn('Path became invalid after closing, skipping');
      continue;
    }

    // Simplify if tolerance > 0 using safe helper
    if (settings.simplifyTolerance > 0) {
      processed = safeSimplify(processed, settings.simplifyTolerance);

      // Validate after simplify
      if (!isValidPath(processed)) {
        console.warn('Path became invalid after simplification, skipping');
        continue;
      }
    }

    processedPaths.push(processed);
  }

  if (processedPaths.length === 0) {
    throw new Error(
      'All paths became invalid during processing. ' +
      'The SVG geometry may be too complex or degenerate. ' +
      'Please simplify the SVG in an editor.'
    );
  }

  // Apply offset if needed using safe helper
  let finalPaths = processedPaths;
  if (Math.abs(settings.offset) > 0.001) {
    const offsetPaths: paper.Path[] = [];

    for (const path of processedPaths) {
      const offsetPath = safeOffset(path, settings.offset);

      if (offsetPath && isValidPath(offsetPath)) {
        offsetPaths.push(offsetPath);
      } else {
        // Fallback to non-offset path if offset fails
        offsetPaths.push(path);
      }
    }

    finalPaths = offsetPaths;
  }

  // Remove tiny islands
  if (settings.removeIslandsThreshold > 0) {
    finalPaths = finalPaths.filter((path) => {
      return isValidPath(path) && Math.abs(path.area) >= settings.removeIslandsThreshold;
    });
  }

  if (finalPaths.length === 0) {
    throw new Error(
      'No paths remaining after filtering. ' +
      'All features were removed as tiny islands or became invalid. ' +
      'Try reducing the "Remove Islands" threshold or simplifying your SVG.'
    );
  }

  // Create compound path and unite using SAFE helper
  const compound = safeCreateAndUniteCompound(finalPaths);

  if (!compound) {
    throw new Error(
      'Failed to create 3D geometry from paths. ' +
      'The SVG geometry may be too complex or contain invalid shapes. ' +
      'Please simplify the SVG in an editor (remove overlaps, fix self-intersections).'
    );
  }

  return compound;
}
