/**
 * Pure geometry / math helpers for the sticker editor.
 *
 * No Angular dependencies, no side effects — trivially unit-testable.
 */

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

// ── Hit testing ───────────────────────────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 * Polygon vertices are in any consistent coordinate space.
 */
export function pointInPoly(
    px: number, py: number,
    poly: { x: number; y: number }[],
): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

/**
 * Returns true if the canvas-local point (px, py) lies inside a rotated rectangle.
 * The rectangle is axis-aligned before rotation; rotation is around the box center.
 * `padding` expands the box on all sides.
 */
export function pointInRotatedRect(
    px: number, py: number,
    box: { x: number; y: number; w: number; h: number },
    rotationDeg: number,
    padding = 0,
): boolean {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rad = -degToRad(rotationDeg);
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = px - cx, dy = py - cy;
    // Rotate the point into box-local frame
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    return Math.abs(lx) <= box.w / 2 + padding && Math.abs(ly) <= box.h / 2 + padding;
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

/**
 * Compute the new scale and rotation for a pinch gesture.
 */
export function applyPinchDelta(
    baseDist: number,
    baseAngleDeg: number,
    baseScale: number,
    baseRotation: number,
    currentPoints: PinchPoints,
): { scale: number; rotation: number; angleDelta: number } {
    const newDist  = pinchDistance(currentPoints);
    const newAngle = pinchAngle(currentPoints);
    const scale    = clamp(baseScale * (newDist / baseDist), 0.2, 4);
    const baseAngleRad = degToRad(baseAngleDeg);
    const angleDelta   = radToDeg(newAngle - baseAngleRad);
    const rotation     = baseRotation + angleDelta;
    return {scale, rotation, angleDelta};
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
 */
export function applyPinchToBaseline(
    baseline: PinchBaseline,
    baseDist: number,
    baseAngleRad: number,
    currentPoints: PinchPoints,
    mid: { x: number; y: number },
): { x: number; y: number; scale: number; rotation: number } {
    const newDist  = pinchDistance(currentPoints);
    const newAngle = pinchAngle(currentPoints);
    const scaleFactor = newDist / baseDist;
    const angleRad    = newAngle - baseAngleRad;
    const angleDelta  = radToDeg(angleRad);
    const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
    return {
        x:        mid.x + (baseline.relCx * cos - baseline.relCy * sin) * scaleFactor,
        y:        mid.y + (baseline.relCx * sin + baseline.relCy * cos) * scaleFactor,
        scale:    clamp(baseline.baseScale * scaleFactor, 0.2, 4),
        rotation: baseline.baseRotation + angleDelta,
    };
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
