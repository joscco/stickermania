import type { StickerPlacement, StickerDefinition } from "@birthday/shared";

/**
 * Point-in-polygon test (ray-casting).
 * Polygon vertices are normalised 0–1 relative to the sticker bounding box.
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
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

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
    getSize: (instanceId: string) => { w: number; h: number },
    catalogMap: Map<string, StickerDefinition>,
): string | null {
    const sorted = [...stickers].sort((a, b) => b.zIndex - a.zIndex);

    for (const p of sorted) {
        const { w, h } = getSize(p.instanceId);
        // Offset from sticker center in client space
        const ox = clientX - (canvasRect.left + p.x);
        const oy = clientY - (canvasRect.top + p.y);
        // Rotate into sticker-local space
        const negRad = -p.rotation * Math.PI / 180;
        const ux = ox * Math.cos(negRad) - oy * Math.sin(negRad);
        const uy = ox * Math.sin(negRad) + oy * Math.cos(negRad);
        const pp = p as any;
        const scaleX = (p.flipX ? -1 : 1) * p.scale * (pp.scaleX ?? 1);
        const scaleY = (p.flipY ? -1 : 1) * p.scale * (pp.scaleY ?? 1);
        if (scaleX === 0 || scaleY === 0) continue;
        // Normalised 0–1 coordinates (0.5, 0.5 = center)
        const lx = ux / (w * scaleX) + 0.5;
        const ly = uy / (h * scaleY) + 0.5;
        if (lx < 0 || lx > 1 || ly < 0 || ly > 1) continue;
        const def = catalogMap.get(p.stickerId);
        if (def?.hitboxPolygon && def.hitboxPolygon.length >= 3) {
            if (pointInPolygon(lx, ly, def.hitboxPolygon)) return p.instanceId;
            continue;
        }
        return p.instanceId;
    }
    return null;
}
