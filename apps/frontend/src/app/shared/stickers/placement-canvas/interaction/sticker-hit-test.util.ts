import type { StickerPlacement } from "@stickermania/shared";
import {degToRad} from '../../model/geometry-helpers';
import {BoundingBox} from '../../model/types';

export type StickerCanvasPointerHit = {
  instanceId: string | null;
  handledByCanvas: boolean;
};

const STICKER_CANVAS_POINTER_HIT_KEY = "__stickerCanvasPointerHit";

export function markStickerCanvasPointerHit(
  event: PointerEvent,
  hit: StickerCanvasPointerHit,
): void {
  (event as PointerEvent & {[STICKER_CANVAS_POINTER_HIT_KEY]?: StickerCanvasPointerHit})[STICKER_CANVAS_POINTER_HIT_KEY] = hit;
}

export function stickerCanvasPointerHitFromEvent(event: PointerEvent): StickerCanvasPointerHit | null {
  return (event as PointerEvent & {[STICKER_CANVAS_POINTER_HIT_KEY]?: StickerCanvasPointerHit})[STICKER_CANVAS_POINTER_HIT_KEY] ?? null;
}

export type StickerHitGeometry = {
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
  bounds: BoundingBox | null;
};

export type StickerHitTestOptions = {
  preferPlacement?: (placement: StickerPlacement) => boolean;
};

/**
 * Hit-test a client-space point against all stickers, topmost first.
 *
 * Coordinate model: p.x / p.y = visual center of each sticker.
 * Supports scale, scaleX, scaleY, flipX, flipY, rotation.
 *
 * @param clientX      Pointer position in client (viewport) pixels
 * @param clientY      Pointer position in client (viewport) pixels
 * @param canvasRect   getBoundingClientRect() of the canvas element
 * @param stickers     Current placement array
 * @param getSize      Returns rendered {w, h} for a given instanceId
 */
export function hitTestOnCanvas(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    stickers: StickerPlacement[],
    getGeometry: (placement: StickerPlacement) => StickerHitGeometry,
    options: StickerHitTestOptions = {},
): string | null {
    const sorted = [...stickers].sort((a, b) => b.zIndex - a.zIndex);
    let fallbackHit: string | null = null;

    for (const stickerPlacement of sorted) {
        const { width, height, pivotX, pivotY, bounds } = getGeometry(stickerPlacement);
        // Offset from sticker center in client space
        const ox = clientX - (canvasRect.left + stickerPlacement.x);
        const oy = clientY - (canvasRect.top + stickerPlacement.y);
        // Rotate into sticker-local space
        const negRad = -degToRad(stickerPlacement.rotation);
        const ux = ox * Math.cos(negRad) - oy * Math.sin(negRad);
        const uy = ox * Math.sin(negRad) + oy * Math.cos(negRad);
        const scaleX = (stickerPlacement.flipX ? -1 : 1) * stickerPlacement.scale * (stickerPlacement.scaleX ?? 1);
        const scaleY = (stickerPlacement.flipY ? -1 : 1) * stickerPlacement.scale * (stickerPlacement.scaleY ?? 1);
        if (scaleX === 0 || scaleY === 0) {
          continue;
        }
        const lx = (ux / scaleX + pivotX) / width;
        const ly = (uy / scaleY + pivotY) / height;
        const hitBounds = bounds ?? {x: 0, y: 0, w: 1, h: 1};
        if (
          lx < hitBounds.x
          || lx > hitBounds.x + hitBounds.w
          || ly < hitBounds.y
          || ly > hitBounds.y + hitBounds.h
        ) {
          continue;
        }

        fallbackHit ??= stickerPlacement.instanceId;
        if (!options.preferPlacement || options.preferPlacement(stickerPlacement)) {
          return stickerPlacement.instanceId;
        }
    }

    return fallbackHit;
}
