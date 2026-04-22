import {BoundingBox} from './sticker-types';
import {degToRad, rotatePt} from './geometry-helpers';

export interface CornerHandles {
    /** Top-left corner (after rotation). */
    tl: { x: number; y: number };
    /** Top-right corner (after rotation). */
    tr: { x: number; y: number };
    /** Bottom-right corner (after rotation). */
    br: { x: number; y: number };
    /** Bottom-left corner (after rotation). */
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
        const {x, y, w, h} = box;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const rad = degToRad(rotation);
        return {
            tl: rotatePt(x,     y,     cx, cy, rad),
            tr: rotatePt(x + w, y,     cx, cy, rad),
            br: rotatePt(x + w, y + h, cx, cy, rad),
            bl: rotatePt(x,     y + h, cx, cy, rad),
        };
    }
}

