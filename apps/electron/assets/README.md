# Electron App Icon

Replace or add `icon-source.png` in this directory to customize the Electron app icon.

Recommended source format:

- PNG
- 1024 x 1024 px
- RGB or RGBA, 8-bit
- non-interlaced
- transparent background is supported
- keep enough padding around the main motif for macOS and Windows masks

Run `npm run icon -w @birthday/electron` to generate:

- `apps/electron/build/icon.png`
- `apps/electron/build/icon.ico`
- all intermediate PNG sizes
- `apps/electron/build/icon.icns` on macOS when `iconutil` accepts the generated iconset

If `icon-source.png` is missing, the generator falls back to the built-in placeholder icon.

## DMG Background

Replace `dmg-background.png` in this directory to customize the macOS installer window.

Recommended source format:

- PNG
- 560 x 380 px
- RGB or RGBA, 8-bit
- keep the app drop zone near x=165, y=205
- keep the Applications drop zone near x=395, y=205
