import { useState, useCallback } from 'react';
import * as THREE from 'three';
import { Upload, Download, Settings2, Loader2 } from 'lucide-react';
import { Preview3D } from './components/Preview3D';
import { PreflightDisplay } from './components/PreflightDisplay';
import { profiles, getProfile } from './profiles';
import type { ProfileSettings, PreflightResult } from './types';
import { parseSVG, preflightCheck, processPaths } from './lib/svgParser';
import { generate3DModel } from './lib/meshGenerator';

function App() {
  const [selectedProfile, setSelectedProfile] = useState(profiles[0].id);
  const [settings, setSettings] = useState<ProfileSettings>(profiles[0].defaults);
  const [svgFile, setSvgFile] = useState<File | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [mesh, setMesh] = useState<THREE.Mesh | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');

  const currentProfile = getProfile(selectedProfile);

  const handleFileUpload = useCallback(async (file: File) => {
    setSvgFile(file);
    setError('');
    setPreflightResult(null);
    setMesh(null);

    try {
      const text = await file.text();
      setSvgContent(text);

      // Parse and run preflight
      const parsed = parseSVG(text);
      const result = preflightCheck(parsed, settings);
      setPreflightResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse SVG');
    }
  }, [settings]);

  const handleProfileChange = (profileId: string) => {
    const profile = getProfile(profileId);
    if (profile) {
      setSelectedProfile(profileId);
      setSettings(profile.defaults);

      // Re-run preflight if we have an SVG
      if (svgContent) {
        try {
          const parsed = parseSVG(svgContent);
          const result = preflightCheck(parsed, profile.defaults);
          setPreflightResult(result);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse SVG');
        }
      }
    }
  };

  const handleSettingChange = (key: keyof ProfileSettings, value: number) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    // Re-run preflight with new settings
    if (svgContent) {
      try {
        const parsed = parseSVG(svgContent);
        const result = preflightCheck(parsed, newSettings);
        setPreflightResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse SVG');
      }
    }
  };

  const handleGenerate = async () => {
    if (!svgContent || !preflightResult) return;

    setIsProcessing(true);
    setError('');

    try {
      // Parse and process SVG
      const parsed = parseSVG(svgContent);
      const processed = processPaths(parsed, settings);

      // Generate 3D model
      const result = await generate3DModel(processed, settings);

      if (!result.success) {
        setError(result.error || 'Failed to generate model');
        return;
      }

      // For preview, we need to regenerate the mesh
      // (the STL export doesn't give us the mesh directly)
      const { generateMesh } = await import('./lib/meshGenerator');
      const previewMesh = generateMesh(processed, settings);
      setMesh(previewMesh);

      // Store STL blob for download
      if (result.stlBlob) {
        (window as any).__stlBlob = result.stlBlob;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate model');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSTL = () => {
    const blob = (window as any).__stlBlob as Blob;
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${svgFile?.name.replace('.svg', '') || 'model'}.stl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canGenerate = svgContent && preflightResult?.passed && !isProcessing;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">SVG2Print</h1>
          <p className="text-gray-600 mt-1">Convert SVGs to printable 3D models</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel - Controls */}
          <div className="space-y-6">
            {/* Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Upload SVG</h2>
              <label className="block">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 cursor-pointer transition">
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                  <p className="text-sm text-gray-600">
                    {svgFile ? svgFile.name : 'Click to upload SVG'}
                  </p>
                  <input
                    type="file"
                    accept=".svg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              </label>
            </div>

            {/* Profile Selection */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Profile</h2>
              <select
                value={selectedProfile}
                onChange={(e) => handleProfileChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              {currentProfile && (
                <p className="text-sm text-gray-600 mt-2">{currentProfile.description}</p>
              )}
            </div>

            {/* Settings */}
            {currentProfile && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Settings2 className="w-5 h-5" />
                  Settings
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Thickness: {settings.thickness.toFixed(1)}mm
                    </label>
                    <input
                      type="range"
                      min={currentProfile.constraints.thicknessRange[0]}
                      max={currentProfile.constraints.thicknessRange[1]}
                      step={0.1}
                      value={settings.thickness}
                      onChange={(e) => handleSettingChange('thickness', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Base Thickness: {settings.baseThickness.toFixed(1)}mm
                    </label>
                    <input
                      type="range"
                      min={currentProfile.constraints.baseThicknessRange[0]}
                      max={currentProfile.constraints.baseThicknessRange[1]}
                      step={0.1}
                      value={settings.baseThickness}
                      onChange={(e) => handleSettingChange('baseThickness', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Offset: {settings.offset.toFixed(1)}mm
                    </label>
                    <input
                      type="range"
                      min={currentProfile.constraints.offsetRange[0]}
                      max={currentProfile.constraints.offsetRange[1]}
                      step={0.1}
                      value={settings.offset}
                      onChange={(e) => handleSettingChange('offset', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Simplify: {settings.simplifyTolerance.toFixed(2)}mm
                    </label>
                    <input
                      type="range"
                      min={currentProfile.constraints.simplifyToleranceRange[0]}
                      max={currentProfile.constraints.simplifyToleranceRange[1]}
                      step={0.01}
                      value={settings.simplifyTolerance}
                      onChange={(e) => handleSettingChange('simplifyTolerance', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bevel: {settings.bevel.toFixed(1)}mm
                    </label>
                    <input
                      type="range"
                      min={currentProfile.constraints.bevelRange[0]}
                      max={currentProfile.constraints.bevelRange[1]}
                      step={0.1}
                      value={settings.bevel}
                      onChange={(e) => handleSettingChange('bevel', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate 3D Model'
                )}
              </button>

              {mesh && (
                <button
                  onClick={handleDownloadSTL}
                  className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download STL
                </button>
              )}
            </div>
          </div>

          {/* Right panel - Preview and Preflight */}
          <div className="lg:col-span-2 space-y-6">
            {/* 3D Preview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">3D Preview</h2>
              {mesh ? (
                <Preview3D mesh={mesh} />
              ) : (
                <div className="w-full h-[400px] bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                  {isProcessing ? 'Generating model...' : 'Upload SVG and generate to preview'}
                </div>
              )}
            </div>

            {/* Preflight */}
            {preflightResult && (
              <div className="bg-white rounded-lg shadow p-6">
                <PreflightDisplay result={preflightResult} />
              </div>
            )}

            {/* Errors */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-900 font-medium">Error</p>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
