# Stickermania Frontend

Angular-21-SPA fuer Board, Player, DEV-Sticker-Editor und Component-Preview.

## Start

```bash
# aus dem Repo-Root
npm run dev:live

# nur Frontend
npm run dev:tools -w @birthday/frontend
```

## Struktur

| Pfad | Zweck |
|---|---|
| `src/app/core` | API-, WebSocket- und State-Services |
| `src/app/features/board-screen` | Moderator-/Board-Ansicht |
| `src/app/features/player` | Player-Shell, Profil, Sticker-Workbench |
| `src/app/features/player/sticker-workbench/creator` | Crop-, Paint- und Start-Schritt fuer Sticker-Erstellung |
| `src/app/shared/stickers` | Wiederverwendbare Sticker-Canvas-, Board-Viewport- und Rendering-Bausteine |
| `src/app/shared/theme/stickermania-theme.ts` | TypeScript-Farbkonstanten fuer Canvas-Code und dynamische Styles |
| `src/styles.css` | Tailwind-4-Theme-Tokens, Utilities und globale Styles |

## Konfiguration

Gemeinsame App-Werte kommen aus `@birthday/shared/stickermaniaConfig`.

Direktimport bevorzugen:

```ts
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
```

Nicht fuer konkrete Config-Werte ueber `@birthday/shared` importieren, weil die IDE sonst oft nur in den Barrel-Export oder in `dist/*.d.ts` springt.

Wichtige Werte dort:

- `stickers.maxOutputSizePx`: maximale gespeicherte Sticker-Groesse, aktuell 750px
- `board.*`: Board-Grenzen, Zoom-Limits, Basis-Sticker-Groesse und View-Performance-Schwellen
- `stickerCreator.*`: Paint-Workspace-Grenzen und Upscale-Regeln

## Farben

Templates sollen Tailwind-Theme-Klassen verwenden, z. B. `bg-stick-yellow`, `text-stick-ink`, `border-stick-paper`.

Canvas-Code oder dynamische Styles sollen `STICKERMANIA_COLORS` aus `src/app/shared/theme/stickermania-theme.ts` verwenden.

Neue Farben immer in beiden Quellen ergaenzen, wenn sie sowohl in Templates als auch in TypeScript gebraucht werden.

## Checks

```bash
npx tsc -p apps/frontend/tsconfig.app.json --noEmit
npx tsc -p apps/frontend/tsconfig.spec.json --noEmit
npm run check-stickers -w @birthday/frontend
```

Der Production-Build nutzt native optionale Dependencies (`esbuild`, `lightningcss`). Wenn Node/NPM zwischen Rosetta x64 und arm64 gewechselt wurde, muss `node_modules` zur aktiven Architektur passen.
