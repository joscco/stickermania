# stickermania Frontend

Angular 21 single-page app for the board, player flow, development sticker editor, and component preview.

## Start

From the repository root:

```bash
npm run dev:live
```

Frontend tools only:

```bash
npm run dev:tools -w @birthday/frontend
```

## Structure

| Path | Purpose |
|---|---|
| `src/app/core` | API, WebSocket, runtime, and state services |
| `src/app/features/board-screen` | Host and board views |
| `src/app/features/player` | Player shell, profile, and sticker workbench |
| `src/app/features/player/sticker-workbench/creator` | Crop, paint, and start steps for sticker creation |
| `src/app/shared/stickers` | Reusable sticker canvas, board viewport, and rendering building blocks |
| `src/app/shared/theme/stickermania-theme.ts` | TypeScript color constants for canvas code and dynamic styles |
| `src/styles.css` | Tailwind 4 theme tokens, utilities, and global styles |

## Configuration

Shared app values come from `@birthday/shared/stickermaniaConfig`.

Prefer direct imports:

```ts
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
```

Do not import concrete config values through `@birthday/shared`, because IDE navigation often jumps to the barrel export or to `dist/*.d.ts` instead of the source file.

Important values:

- `stickers.maxOutputSizePx`: maximum saved sticker size, currently 750px
- `board.*`: board bounds, zoom limits, base sticker size, and view performance thresholds
- `stickerCreator.*`: paint workspace bounds and upscale rules

## Colors

Templates should use Tailwind theme classes such as `bg-stick-yellow`, `text-stick-ink`, and `border-stick-paper`.

Canvas code and dynamic styles should use `STICKERMANIA_COLORS` from `src/app/shared/theme/stickermania-theme.ts`.

Add new colors to both sources when they are needed in templates and TypeScript.

## Checks

```bash
npx tsc -p apps/frontend/tsconfig.app.json --noEmit
npx tsc -p apps/frontend/tsconfig.spec.json --noEmit
npm run check-stickers -w @birthday/frontend
```

The production build uses native optional dependencies such as `esbuild` and `lightningcss`. If Node or npm was switched between Rosetta x64 and arm64, `node_modules` must match the active architecture.
