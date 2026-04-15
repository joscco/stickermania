import type {StickerPlacement} from "@birthday/shared";
import {degToRad} from '../geometry-helpers';
import {resolveToImgUrl, getSpriteViewBox} from '../sprite-url.util';
import {CANVAS_STICKER_PX} from '../sticker-types';

/**
 * Renders all sticker placements onto an off-screen Canvas2D and returns a
 * PNG data-URL at 2× pixel density.
 *
 * Supports only sprite references ("sprite:#id").
 */
export async function renderCanvasToDataUrl(
  canvasEl: HTMLElement,
  stickers: StickerPlacement[],
  getUrl: (stickerId: string) => string,
): Promise<string> {
  const size = canvasEl.clientWidth;
  const pixelScale = 2;

  const offscreen = document.createElement("canvas");
  offscreen.width = size * pixelScale;
  offscreen.height = size * pixelScale;
  const ctx = offscreen.getContext("2d")!;
  ctx.scale(pixelScale, pixelScale);

  const imageCache = await loadImages(stickers, getUrl);

  const sorted = [...stickers].sort((a, b) => a.zIndex - b.zIndex);
  for (const placement of sorted) {
    const imageUrl = getUrl(placement.stickerId);
    const img = imageCache.get(imageUrl);
    if (!img) continue;

    // Derive rendered size from viewBox aspect ratio (same as getRenderedSize)
    const vb = getSpriteViewBox(imageUrl);
    const drawH = CANVAS_STICKER_PX;
    const drawW = vb && vb.height > 0 ? Math.round(drawH * vb.width / vb.height) : CANVAS_STICKER_PX;

    const cx = placement.x;
    const cy = placement.y;
    const pp = placement as any;
    const sx = (placement.flipX ? -1 : 1) * placement.scale * (pp.scaleX ?? 1);
    const sy = (placement.flipY ? -1 : 1) * placement.scale * (pp.scaleY ?? 1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(degToRad(placement.rotation));
    ctx.scale(sx, sy);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  return offscreen.toDataURL("image/png");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadImages(
  stickers: StickerPlacement[],
  getUrl: (stickerId: string) => string,
): Promise<Map<string, HTMLImageElement>> {
  const cache = new Map<string, HTMLImageElement>();
  const uniqueUrls = [...new Set(stickers.map(p => getUrl(p.stickerId)).filter(Boolean))];

  await Promise.all(uniqueUrls.map(async url => {
    const {url: resolved} = await resolveToImgUrl(url, CANVAS_STICKER_PX * 3);
    await new Promise<void>(resolve => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        URL.revokeObjectURL(resolved);
        cache.set(url, img);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(resolved);
        resolve();
      };
      img.src = resolved;
    });
  }));

  return cache;
}
