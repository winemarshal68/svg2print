import paper from 'paper';
import type { PreflightResult, PreflightIssue, ProfileSettings } from '../types';

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
      throw new Error('Failed to parse SVG');
    }

    // Collect all path items
    const paths: paper.Path[] = [];

    function collectPaths(item: paper.Item) {
      if (item instanceof paper.Path) {
        const path = item as paper.Path;
        if (path.segments && path.segments.length > 0) {
          paths.push(path.clone() as paper.Path);
        }
      }
      if (item instanceof paper.Group || item instanceof paper.Layer) {
        item.children.forEach(collectPaths);
      }
    }

    collectPaths(imported);

    if (paths.length === 0) {
      throw new Error('No valid paths found in SVG');
    }

    // Calculate bounds
    const bounds = paths.reduce((acc, path) => {
      return acc ? acc.unite(path.bounds) : path.bounds;
    }, null as paper.Rectangle | null);

    // Create a compound path from all paths for later processing
    const compoundPath = new paper.CompoundPath({ children: paths.map(p => p.clone()) });

    return {
      paths,
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

  // Count paths and points
  let closedPaths = 0;
  let openPaths = 0;
  let totalPoints = 0;
  let hasIntersections = false;

  paths.forEach((path) => {
    if (path.closed) {
      closedPaths++;
    } else {
      openPaths++;
    }
    totalPoints += path.segments.length;
  });

  // Check for open paths
  if (openPaths > 0) {
    issues.push({
      severity: 'warning',
      message: `Found ${openPaths} open path${openPaths > 1 ? 's' : ''}`,
      detail: 'Open paths will be automatically closed during processing',
      suggestedFix: 'Close paths in your SVG editor for more predictable results',
    });
  }

  // Check for excessive node count
  const avgPointsPerPath = totalPoints / paths.length;
  if (avgPointsPerPath > 500) {
    issues.push({
      severity: 'warning',
      message: `High node count detected (avg ${Math.round(avgPointsPerPath)} points per path)`,
      detail: 'Complex paths may slow down processing',
      suggestedFix: `Increase simplify tolerance to ${settings.simplifyTolerance * 2}mm or higher`,
    });
  }

  // Check for self-intersections (basic check on first few paths)
  const pathsToCheck = paths.slice(0, Math.min(5, paths.length));
  for (const path of pathsToCheck) {
    const intersections = path.getIntersections(path);
    if (intersections.length > 0) {
      hasIntersections = true;
      break;
    }
  }

  if (hasIntersections) {
    issues.push({
      severity: 'warning',
      message: 'Self-intersections detected in paths',
      detail: 'Some paths cross over themselves',
      suggestedFix: 'Simplification and union operations will attempt to fix this',
    });
  }

  // Check for tiny features
  let tinyIslandsCount = 0;
  paths.forEach((path) => {
    if (path.area < settings.removeIslandsThreshold) {
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
      detail: 'This may exceed typical print bed sizes',
      suggestedFix: 'Consider scaling down your SVG before uploading',
    });
  }

  if (maxDimension < 10) {
    issues.push({
      severity: 'warning',
      message: `Very small SVG detected (${maxDimension.toFixed(1)}mm max dimension)`,
      detail: 'Features may be too small to print reliably',
      suggestedFix: 'Consider scaling up your SVG before uploading',
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

  // Clone paths for processing
  const processedPaths = paths.map((p) => {
    let path = p.clone() as paper.Path;

    // Close open paths
    if (!path.closed) {
      path.closePath();
    }

    // Simplify if tolerance > 0
    if (settings.simplifyTolerance > 0) {
      path.simplify(settings.simplifyTolerance);
    }

    return path;
  });

  // Apply offset if needed
  let finalPaths = processedPaths;
  if (Math.abs(settings.offset) > 0.001) {
    finalPaths = processedPaths.map((path) => {
      const offsetPath = (path as any).offsetPath(settings.offset);
      return offsetPath || path;
    }).filter(p => p !== null);
  }

  // Remove tiny islands
  if (settings.removeIslandsThreshold > 0) {
    finalPaths = finalPaths.filter((path) => {
      return Math.abs(path.area) >= settings.removeIslandsThreshold;
    });
  }

  // Union all paths into a single compound path
  const compound = new paper.CompoundPath({
    children: finalPaths.map(p => p.clone()),
  });

  // Unite to resolve overlaps (this is the boolean union operation)
  const united = compound.unite(compound);

  return united as paper.CompoundPath;
}
