import {degToRad, rotatePt} from "./geometry-helpers";

/** Axis-aligned bounding box in canvas-local pixels. */
export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Initial rendered height of a sticker on the canvas — matches the CSS class on the sticker element. */
export const CANVAS_STICKER_PX = 200;

export interface CornerHandles {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
}

/**
 * All geometric information about the current selection:
 * the axis-aligned bounding box (in canvas coords), the rotation angle,
 * and the four corner handle positions already rotated around the box centre.
 */
export class SelectionInfo {
    readonly box: BoundingBox;
    readonly rotation: number;
    readonly corners: CornerHandles;

    constructor(box: BoundingBox, rotation: number) {
        this.box = box;
        this.rotation = rotation;
        this.corners = SelectionInfo.computeCorners(box, rotation);
    }

    private static computeCorners(box: BoundingBox, rotation: number): CornerHandles {
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        const rad = degToRad(rotation);
        return {
            tl: rotatePt(box.x,          box.y,          cx, cy, rad),
            tr: rotatePt(box.x + box.w,  box.y,          cx, cy, rad),
            br: rotatePt(box.x + box.w,  box.y + box.h,  cx, cy, rad),
            bl: rotatePt(box.x,          box.y + box.h,  cx, cy, rad),
        };
    }
}
