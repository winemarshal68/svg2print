export interface Profile {
  id: string;
  name: string;
  description: string;
  defaults: ProfileSettings;
  constraints: ProfileConstraints;
}

export interface ProfileSettings {
  thickness: number; // mm - extrusion height
  baseThickness: number; // mm - base layer
  offset: number; // mm - path expansion (positive) or contraction (negative)
  simplifyTolerance: number; // mm - path simplification
  removeIslandsThreshold: number; // mm² - remove features smaller than this
  bevel: number; // mm - optional edge bevel
}

export interface ProfileConstraints {
  thicknessRange: [number, number];
  baseThicknessRange: [number, number];
  offsetRange: [number, number];
  simplifyToleranceRange: [number, number];
  bevelRange: [number, number];
}

export interface PreflightIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  detail?: string;
  suggestedFix?: string;
}

export interface PreflightResult {
  passed: boolean;
  issues: PreflightIssue[];
  stats: {
    pathCount: number;
    closedPaths: number;
    openPaths: number;
    totalPoints: number;
    boundingBox: { width: number; height: number };
    hasIntersections: boolean;
    tinyIslandsCount: number;
  };
}

export interface GenerationResult {
  success: boolean;
  stlBlob?: Blob;
  threeMFBlob?: Blob;
  error?: string;
  processingTime: number; // ms
}
