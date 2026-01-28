import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { PreflightResult } from '../types';

interface PreflightDisplayProps {
  result: PreflightResult;
}

export function PreflightDisplay({ result }: PreflightDisplayProps) {
  if (result.issues.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold text-green-900">Preflight Passed</h3>
            <p className="text-sm text-green-700 mt-1">No issues detected. Ready to generate.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900">Preflight Checks</h3>

      {result.issues.map((issue, index) => {
        const Icon = issue.severity === 'error'
          ? AlertCircle
          : issue.severity === 'warning'
          ? AlertTriangle
          : Info;

        const colorClasses = issue.severity === 'error'
          ? 'bg-red-50 border-red-200 text-red-900'
          : issue.severity === 'warning'
          ? 'bg-yellow-50 border-yellow-200 text-yellow-900'
          : 'bg-blue-50 border-blue-200 text-blue-900';

        const iconColor = issue.severity === 'error'
          ? 'text-red-600'
          : issue.severity === 'warning'
          ? 'text-yellow-600'
          : 'text-blue-600';

        return (
          <div key={index} className={`border rounded-lg p-4 ${colorClasses}`}>
            <div className="flex items-start gap-3">
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{issue.message}</p>
                {issue.detail && (
                  <p className="text-sm mt-1 opacity-90">{issue.detail}</p>
                )}
                {issue.suggestedFix && (
                  <p className="text-sm mt-2 font-medium">
                    Suggestion: {issue.suggestedFix}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
        <h4 className="font-medium text-gray-900 mb-2">Statistics</h4>
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-700">
          <div>Paths: {result.stats.pathCount}</div>
          <div>Closed: {result.stats.closedPaths}</div>
          <div>Open: {result.stats.openPaths}</div>
          <div>Points: {result.stats.totalPoints}</div>
          <div className="col-span-2">
            Size: {result.stats.boundingBox.width.toFixed(1)} × {result.stats.boundingBox.height.toFixed(1)} mm
          </div>
        </div>
      </div>
    </div>
  );
}
