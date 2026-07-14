/**
 * Pure geometry / math helpers for the sticker editor.
 *
 * No Angular dependencies, no side effects — trivially unit-testable.
 */
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";

// ── Basic math ────────────────────────────────────────────────────────────────

/** Clamp a value between min and max (inclusive). */
export function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/** Convert degrees to radians. */
export function degToRad(deg: number): number {
    return deg * Math.PI / 180;
}

/** Convert radians to degrees. */
export function radToDeg(rad: number): number {
    return rad * (180 / Math.PI);
}

// ── Point / vector math ───────────────────────────────────────────────────────

/** Euclidean distance between two points. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(bx - ax, by - ay);
}

/** Angle (radians) from point A to point B. */
export function angleBetween(ax: number, ay: number, bx: number, by: number): number {
    return Math.atan2(by - ay, bx - ax);
}

/** Midpoint between two points. */
export function midpoint(ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
    return {x: (ax + bx) / 2, y: (ay + by) / 2};
}

/** Centroid (average position) of a list of {x, y} points. */
export function centroid(points: { x: number; y: number }[]): { x: number; y: number } {
    if (!points.length) return {x: 0, y: 0};
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return {x: sx / points.length, y: sy / points.length};
}

// ── Rotation ──────────────────────────────────────────────────────────────────

/**
 * Rotate a point around a center by `rad` radians.
 */
export function rotatePt(
    x: number, y: number,
    cx: number, cy: number,
    rad: number,
): { x: number; y: number } {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    return {x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos};
}

// ── Canvas / pointer helpers ──────────────────────────────────────────────────

/**
 * Returns true if the client-space pointer position is outside the given DOMRect.
 */
export function isPointerOutsideRect(clientX: number, clientY: number, rect: DOMRect): boolean {
    return clientX < rect.left || clientX > rect.right ||
           clientY < rect.top  || clientY > rect.bottom;
}

/**
 * Returns true if the given canvas-local position (x, y) is outside the canvas.
 */
export function isPositionOutsideCanvas(x: number, y: number, rect: DOMRect): boolean {
    return x < 0 || x > rect.width || y < 0 || y > rect.height;
}

// ── Pinch / two-finger gesture math ──────────────────────────────────────────

export interface PinchPoints {
    ax: number; ay: number;
    bx: number; by: number;
}

/** Distance between two touch points. */
export function pinchDistance(p: PinchPoints): number {
    return distance(p.ax, p.ay, p.bx, p.by) || 1;
}

/** Angle (radians) between two touch points. */
export function pinchAngle(p: PinchPoints): number {
    return angleBetween(p.ax, p.ay, p.bx, p.by);
}

/** Canvas-local midpoint of two touch points. */
export function pinchMidpoint(p: PinchPoints, rect: DOMRect): { x: number; y: number } {
    const mid = midpoint(p.ax, p.ay, p.bx, p.by);
    return {x: mid.x - rect.left, y: mid.y - rect.top};
}

export interface PinchBaseline {
    relCx: number;
    relCy: number;
    baseScale: number;
    baseRotation: number;
}

/**
 * Given a single sticker's pinch baseline (position relative to the gesture centre,
 * plus its original scale/rotation), compute the new x, y, scale and rotation after
 * the gesture has moved to `currentPoints`.
 *
 * `mid` is the canvas-local gesture midpoint (from `pinchMidpoint`).
 *
 * The `scaleFactor` should already be clamped at the group level by the caller
 * so that no sticker in the group exceeds [MIN_SCALE, MAX_SCALE].
 */
export function applyPinchToBaseline(
    baseline: PinchBaseline,
    baseAngleRad: number,
    scaleFactor: number,
    currentPoints: PinchPoints,
    mid: { x: number; y: number },
): { x: number; y: number; scale: number; rotation: number } {
    const newAngle = pinchAngle(currentPoints);
    const angleRad    = newAngle - baseAngleRad;
    const angleDelta  = radToDeg(angleRad);

    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    return {
        x:        mid.x + (baseline.relCx * cos - baseline.relCy * sin) * scaleFactor,
        y:        mid.y + (baseline.relCx * sin + baseline.relCy * cos) * scaleFactor,
        scale:    baseline.baseScale * scaleFactor,
        rotation: baseline.baseRotation + angleDelta,
    };
}

/** Scale limits for individual stickers. */
export const MIN_SCALE: number = STICKERMANIA_CONFIG.placementCanvas.minStickerScale;
export const MAX_SCALE: number = STICKERMANIA_CONFIG.placementCanvas.maxStickerScale;

/**
 * Clamp a scaleFactor so that every sticker's resulting scale stays within
 * [MIN_SCALE, MAX_SCALE]. This keeps groups consistent — all members scale
 * by the same factor, so relative positions are preserved.
 */
export function clampGroupScaleFactor(
    factor: number,
    baseScales: number[],
    minScale = MIN_SCALE,
    maxScale = MAX_SCALE,
): number {
    if (!baseScales.length) return factor;
    let lo = 0;   // highest lower bound (factor must be >= this)
    let hi = Infinity; // lowest upper bound (factor must be <= this)
    for (const bs of baseScales) {
        if (bs <= 0) continue;
        lo = Math.max(lo, minScale / bs);
        hi = Math.min(hi, maxScale / bs);
    }
    // If lo > hi the group can't satisfy all constraints — pick the closer bound
    if (lo > hi) return factor < (lo + hi) / 2 ? lo : hi;
    return clamp(factor, lo, hi);
}

// ── Vector / bounding-box helpers ─────────────────────────────────────────────

/**
 * Rotate a 2-D vector (dx, dy) around the origin by `rad` radians.
 * Equivalent to `rotatePt(dx, dy, 0, 0, rad)` but returns a plain tuple.
 */
export function rotateVec(dx: number, dy: number, rad: number): { x: number; y: number } {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return {x: dx * cos - dy * sin, y: dx * sin + dy * cos};
}

/**
 * Given a list of axis-aligned half-extents (hw, hh), centers (cx, cy) and
 * per-item rotation angles `itemRads`, projects all four corners of each
 * item into a common frame that is rotated by `-frameRad` around `origin`,
 * then returns the axis-aligned bounding box in that frame.
 *
 * Used by `computeSelectionInfo` for both group and lasso selections.
 */
export function rotatedBoundingBox(
    items: { cx: number; cy: number; hw: number; hh: number; itemRad: number }[],
    origin: { x: number; y: number },
    frameRad: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
    const cos = Math.cos(-frameRad), sin = Math.sin(-frameRad);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const {cx, cy, hw, hh, itemRad} of items) {
        const pCos = Math.cos(itemRad), pSin = Math.sin(itemRad);
        for (const [ex, ey] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as [number, number][]) {
            // World position of this corner
            const wx = cx + ex * pCos - ey * pSin;
            const wy = cy + ex * pSin + ey * pCos;
            // Rotate into frame
            const dx = wx - origin.x, dy = wy - origin.y;
            const lx = origin.x + dx * cos - dy * sin;
            const ly = origin.y + dx * sin + dy * cos;
            if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
            if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
        }
    }
    return {minX, minY, maxX, maxY};
}
