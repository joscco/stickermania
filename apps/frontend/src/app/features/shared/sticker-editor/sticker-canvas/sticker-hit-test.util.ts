import type { StickerPlacement, StickerDefinition } from "@birthday/shared";
import {pointInPoly, degToRad} from '../geometry-helpers';

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
 * @param catalogMap   stickerId → StickerDefinition (for hitbox polygons)
 */
export function hitTestOnCanvas(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    stickers: StickerPlacement[],
    getSize: (instanceId: string) => { width: number; height: number },
    catalogMap: Map<string, StickerDefinition>,
): string | null {
    const sorted = [...stickers].sort((a, b) => b.zIndex - a.zIndex);

    for (const stickerPlacement of sorted) {
        const { width, height } = getSize(stickerPlacement.instanceId);
        // Offset from sticker center in client space
        const ox = clientX - (canvasRect.left + stickerPlacement.x);
        const oy = clientY - (canvasRect.top + stickerPlacement.y);
        // Rotate into sticker-local space
        const negRad = -degToRad(stickerPlacement.rotation);
        const ux = ox * Math.cos(negRad) - oy * Math.sin(negRad);
        const uy = ox * Math.sin(negRad) + oy * Math.cos(negRad);
        const pp = stickerPlacement as any;
        const scaleX = (stickerPlacement.flipX ? -1 : 1) * stickerPlacement.scale * (pp.scaleX ?? 1);
        const scaleY = (stickerPlacement.flipY ? -1 : 1) * stickerPlacement.scale * (pp.scaleY ?? 1);
        if (scaleX === 0 || scaleY === 0) {
          continue;
        }
        // Normalised 0–1 coordinates (0.5, 0.5 = center)
        const lx = ux / (width * scaleX) + 0.5;
        const ly = uy / (height * scaleY) + 0.5;
        if (lx < 0 || lx > 1 || ly < 0 || ly > 1) {
          continue;
        }
        const def = catalogMap.get(stickerPlacement.stickerId);
        if (def?.hitboxPolygon && def.hitboxPolygon.length >= 3) {
            if (pointInPoly(lx, ly, def.hitboxPolygon)) {
              return stickerPlacement.instanceId;
            }
            continue;
        }
        return stickerPlacement.instanceId;
    }
    return null;
}
