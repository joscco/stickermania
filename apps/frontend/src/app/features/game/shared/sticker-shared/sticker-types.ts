/** Axis-aligned bounding box in canvas-local pixels. */
export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Rendered height of a sticker on the canvas — matches the `h-16` (64 px) CSS class. */
export const CANVAS_STICKER_PX = 64;

