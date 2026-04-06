import type { StickerPlacement, StickerDefinition } from "@birthday/shared";

/** Size in px of the rendered sticker (matches w-16 h-16 = 64px). */
const STICKER_RENDER_SIZE = 64;

/**
 * Point-in-polygon test using the ray-casting algorithm.
 * `polygon` is an array of {x, y} vertices forming a closed polygon.
 */
export function pointInPolygon(
    px: number,
    py: number,
    polygon: Array<{ x: number; y: number }>,
): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect =
            yi > py !== yj > py &&
            px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Transform a canvas-local point into a sticker's local coordinate space,
 * accounting for position, scale, and rotation.
 *
 * Returns normalised coordinates (0–1) relative to the sticker's bounding box.
 * Returns null if the point is outside the bounding box entirely.
 */
export function canvasPointToStickerLocal(
    canvasX: number,
    canvasY: number,
    placement: StickerPlacement,
): { localX: number; localY: number } | null {
    const size = STICKER_RENDER_SIZE * placement.scale;
    // Sticker center = top-left + half size
    const cx = placement.x + size / 2;
    const cy = placement.y + size / 2;

    // Translate to sticker center
    let dx = canvasX - cx;
    let dy = canvasY - cy;

    // Inverse-rotate around the center
    const rad = (-placement.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;

    // Back to top-left relative, then normalise to 0–1
    const localX = (rx + size / 2) / size;
    const localY = (ry + size / 2) / size;

    // Quick bounding-box rejection
    if (localX < 0 || localX > 1 || localY < 0 || localY > 1) {
        return null;
    }

    return { localX, localY };
}

/**
 * Hit-test a point against a single sticker placement.
 *
 * 1. Transform the point into the sticker's local (rotation-aware) coordinate space.
 * 2. If the sticker has a `hitboxPolygon`, use point-in-polygon.
 * 3. Otherwise, the bounding-box check suffices.
 */
export function hitTestSingleSticker(
    canvasX: number,
    canvasY: number,
    placement: StickerPlacement,
    definition: StickerDefinition | undefined,
): boolean {
    const local = canvasPointToStickerLocal(canvasX, canvasY, placement);
    if (!local) return false;

    // If polygon is defined, use it
    if (definition?.hitboxPolygon && definition.hitboxPolygon.length >= 3) {
        return pointInPolygon(local.localX, local.localY, definition.hitboxPolygon);
    }

    // Bounding box already passed
    return true;
}

/**
 * Hit-test all stickers on the canvas (highest z-index first).
 * Returns the instanceId of the topmost hit sticker, or null.
 */
export function hitTestStickers(
    canvasX: number,
    canvasY: number,
    stickers: StickerPlacement[],
    catalogMap: Map<string, StickerDefinition>,
): string | null {
    const sorted = [...stickers].sort((a, b) => b.zIndex - a.zIndex);

    for (const p of sorted) {
        const def = catalogMap.get(p.stickerId);
        if (hitTestSingleSticker(canvasX, canvasY, p, def)) {
            return p.instanceId;
        }
    }
    return null;
}

