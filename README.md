# SVG2Print

Convert SVG files into printable 2.5D 3D models. Local-first, no Blender required.

## Features

- **Local-first**: All processing happens in your browser. Your files never leave your machine.
- **Profile-driven**: Presets for common use cases (Logo/Sign, Cookie Cutter, Stamp, Keychain)
- **Preflight checks**: Automatic validation with clear diagnostics
- **3D preview**: Interactive preview before exporting
- **STL export**: Ready for Bambu Studio, PrusaSlicer, or any slicer

## Quick Start

### Development

```bash
npm install
npm run dev
```

Visit `http://localhost:5173` to use the app.

### Production Build

```bash
npm run build
npm run preview
```

## How to Use

1. **Upload an SVG** - Click the upload area and select your SVG file
2. **Choose a profile** - Select a preset that matches your use case
3. **Adjust settings** - Fine-tune thickness, offset, and other parameters
4. **Review preflight** - Check for warnings or issues
5. **Generate** - Click "Generate 3D Model" to create the mesh
6. **Download STL** - Download the file ready for your slicer

## Profiles

### Logo / Sign
Thick base with raised design. Perfect for wall-mounted signs and logos.
- **Thickness**: 3mm (raised area)
- **Base**: 2mm
- **Use case**: Business signs, nameplate, wall art

### Cookie Cutter
Thin wall outline with no base. Sharp cutting edge for cookies and clay.
- **Thickness**: 12mm (cutting wall height)
- **Base**: 0mm
- **Offset**: +0.5mm (outward expansion)
- **Use case**: Cookie cutters, fondant cutters, clay stamps

### Stamp
Thick handle with shallow inverted relief. For ink stamps and embossing.
- **Thickness**: 1.5mm (relief depth)
- **Base**: 8mm (handle)
- **Offset**: -0.2mm (crisp edges)
- **Use case**: Rubber stamps, embossing, soap stamps

### Keychain
Moderate thickness with optional bevel. Includes hole for keyring.
- **Thickness**: 2mm
- **Base**: 1mm
- **Bevel**: 0.3mm
- **Use case**: Keychains, bag tags, zipper pulls

## Settings Explained

- **Thickness**: Height of the extruded design (mm)
- **Base Thickness**: Height of the base layer beneath the design (mm)
- **Offset**: Expand (+) or contract (-) paths before extrusion (mm)
- **Simplify**: Path simplification tolerance; higher = fewer points, smoother curves (mm)
- **Remove Islands**: Minimum feature size; smaller features are removed (mm²)
- **Bevel**: Optional edge rounding for comfort and aesthetics (mm)

## Preflight Checks

The app validates your SVG before generating the model:

- **Open paths**: Automatically closed during processing
- **High node count**: Recommend increasing simplification
- **Self-intersections**: Union operations attempt to fix
- **Tiny features**: Features below threshold are removed
- **Size warnings**: Alert if model is too large or small for printing

## Supported SVG Features

### Works Well
- Filled paths (rectangles, circles, polygons, custom paths)
- Compound paths (shapes with holes)
- Groups and layers
- Bezier curves

### Not Supported
- Strokes (convert to fills in your SVG editor)
- Gradients, patterns, filters (visual only, ignored)
- Text (convert to paths first)
- Embedded images

## Limitations

- **2.5D only**: This creates extruded shapes, not full 3D models
- **No free-form editing**: Use an SVG editor to modify your design
- **Client-side processing**: Very complex SVGs may be slow
- **Browser memory**: Large models may exceed browser limits

## Tips for Best Results

1. **Simplify in your editor**: Clean up your SVG in Inkscape/Illustrator first
2. **Convert text to paths**: Text won't render otherwise
3. **Combine overlapping shapes**: Use union/merge before exporting
4. **Remove unnecessary points**: Simplify curves for faster processing
5. **Test with samples**: Use the provided sample SVGs to learn the profiles

## Sample Files

Check `public/samples/` for example SVGs:
- `star.svg` - Simple polygon shape
- `heart.svg` - Curved paths
- `circle-donut.svg` - Shape with hole

## Technology Stack

- **React + TypeScript** - UI framework
- **Vite** - Build tool
- **Paper.js** - 2D geometry processing (path operations, boolean union)
- **Three.js** - 3D rendering and STL export
- **Tailwind CSS** - Styling

## Architecture

```
SVG Upload
  → Parse paths (Paper.js)
  → Preflight validation
  → Apply profile settings (offset, simplify, union)
  → Convert to Three.js shapes
  → Extrude to 3D geometry
  → Export STL
```

## Why No Blender?

This tool uses robust 2D CAD operations (Paper.js) and deterministic 3D extrusion (Three.js). The workflow is:
- **Repeatable**: Same input + settings = same output
- **Faster**: No heavyweight 3D suite required
- **Safer**: Preflight catches issues before generation
- **Simpler**: No scripting or manual mesh cleanup

## Future Enhancements (Not in MVP)

- 3MF export (better than STL for multi-material)
- PNG/JPG import with auto-tracing
- Custom profiles (save your own presets)
- Batch processing
- Advanced features (taper, variable thickness, etc.)

## License

MIT

## Contributing

Issues and PRs welcome at https://github.com/YOUR_USERNAME/svg2print
