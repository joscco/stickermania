import type {StickerPlacement} from '@birthday/shared';
import type {BoundingBox} from './sticker-types';
import {centroid, clamp, degToRad, rotateVec, rotatedBoundingBox} from '../geometry-helpers';

/**
 * Pure functions for transforming StickerPlacement arrays.
 * No Angular dependencies, no side effects — trivially unit-testable.
 *
 * All functions return a new array; the original is never mutated.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────


export function generateInstanceId(): string {
    return `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateGroupId(): string {
    return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Z-order ───────────────────────────────────────────────────────────────────

export function swapZ(placements: StickerPlacement[], ids: string[], direction: 1 | -1): StickerPlacement[] {
    const sorted   = [...placements].sort((a, b) => a.zIndex - b.zIndex);
    const groupSet = new Set(ids);
    const outside  = sorted.filter(p => !groupSet.has(p.instanceId));
    const inside   = sorted.filter(p =>  groupSet.has(p.instanceId));
    if (!inside.length || !outside.length) return placements;

    if (direction > 0) {
        const maxGroupZ = Math.max(...inside.map(p => p.zIndex));
        const neighbor  = outside.find(p => p.zIndex > maxGroupZ);
        if (!neighbor) return placements;
        return placements.map(p => {
            if (groupSet.has(p.instanceId)) return {...p, zIndex: p.zIndex + (neighbor.zIndex - maxGroupZ) + inside.length};
            if (p.instanceId === neighbor.instanceId) return {...p, zIndex: p.zIndex - inside.length};
            return p;
        });
    } else {
        const minGroupZ = Math.min(...inside.map(p => p.zIndex));
        const neighbor  = [...outside].reverse().find(p => p.zIndex < minGroupZ);
        if (!neighbor) return placements;
        return placements.map(p => {
            if (groupSet.has(p.instanceId)) return {...p, zIndex: p.zIndex - (minGroupZ - neighbor.zIndex) - inside.length};
            if (p.instanceId === neighbor.instanceId) return {...p, zIndex: p.zIndex + inside.length};
            return p;
        });
    }
}

export function moveToEdge(placements: StickerPlacement[], ids: string[], edge: 'front' | 'back'): StickerPlacement[] {
    const groupSet = new Set(ids);
    const outside  = placements.filter(p => !groupSet.has(p.instanceId)).sort((a, b) => a.zIndex - b.zIndex);
    const inside   = placements.filter(p =>  groupSet.has(p.instanceId)).sort((a, b) => a.zIndex - b.zIndex);
    const refZ     = edge === 'front'
        ? (outside.length ? Math.max(...outside.map(p => p.zIndex)) : 0)
        : (outside.length ? Math.min(...outside.map(p => p.zIndex)) : 1);

    return placements.map(p => {
        const i = inside.findIndex(q => q.instanceId === p.instanceId);
        if (i < 0) return p;
        return {...p, zIndex: edge === 'front' ? refZ + i + 1 : refZ - inside.length + i};
    });
}

// ── Scale / Rotate / Mirror ───────────────────────────────────────────────────

export function rotateSingle(placements: StickerPlacement[], id: string, degrees: number): StickerPlacement[] {
    return placements.map(p => p.instanceId === id ? {...p, rotation: p.rotation + degrees} : p);
}

export function scaleSingle(placements: StickerPlacement[], id: string, factor: number): StickerPlacement[] {
    return placements.map(p => p.instanceId === id
        ? {...p, scale: clamp(p.scale * factor, 0.2, 4)}
        : p,
    );
}

export function mirrorSingle(placements: StickerPlacement[], id: string, axis: 'h' | 'v'): StickerPlacement[] {
    return placements.map(p => p.instanceId !== id ? p
        : axis === 'h' ? {...p, flipX: !p.flipX}
        :                {...p, flipY: !p.flipY},
    );
}

/**
 * Rotate / scale / mirror a group of stickers around their centroid.
 * Pass `rotateDeg=0` / `scaleFactor=1` / `mirrorAxis=null` for no-ops.
 */
export function applyGroupTransform(
    placements: StickerPlacement[],
    ids: string[],
    rotateDeg: number,
    scaleFactor: number,
    mirrorAxis: 'h' | 'v' | null,
): StickerPlacement[] {
    const selected = placements.filter(p => ids.includes(p.instanceId));
    if (!selected.length) return placements;
    const {x: cx, y: cy} = centroid(selected.map(p => ({x: p.x, y: p.y})));
    const rad = degToRad(rotateDeg);

    return placements.map(p => {
        if (!ids.includes(p.instanceId)) return p;
        let rx = p.x - cx, ry = p.y - cy;
        if (mirrorAxis === 'h') rx = -rx;
        if (mirrorAxis === 'v') ry = -ry;
        const {x: nx, y: ny} = rotateVec(rx, ry, rad);
        return {
            ...p,
            x:        cx + nx * scaleFactor,
            y:        cy + ny * scaleFactor,
            scale:    clamp(p.scale * scaleFactor, 0.2, 4),
            rotation: p.rotation + rotateDeg,
            ...(mirrorAxis === 'h' ? {flipX: !p.flipX} : {}),
            ...(mirrorAxis === 'v' ? {flipY: !p.flipY} : {}),
        };
    });
}

// ── Corner / stretch / rotation handle math ───────────────────────────────────

export function applyCornerScale(
    placements: StickerPlacement[],
    ids: string[],
    corner: 'nw' | 'ne' | 'se' | 'sw',
    dx: number,
    dy: number,
    boundingBoxSize: {width: number; height: number} | null,
    getRenderedSize: (id: string) => {width: number; height: number},
): StickerPlacement[] {
    const signX  = (corner === 'ne' || corner === 'se') ? 1 : -1;
    const signY  = (corner === 'se' || corner === 'sw') ? 1 : -1;
    // Project the mouse delta onto the diagonal direction of the corner.
    // The corner sits at half-width / half-height from center, so we compute
    // the ratio so the corner tracks the mouse 1:1.
    const delta  = (dx * signX + dy * signY) / 2;

    if (ids.length !== 1) {
        if (!boundingBoxSize || boundingBoxSize.width < 1 || boundingBoxSize.height < 1) return placements;
        // half-diagonal of the bounding box
        const halfDiag = Math.max(boundingBoxSize.width, boundingBoxSize.height) / 2;
        const factor = (halfDiag + delta) / halfDiag;
        return applyGroupTransform(placements, ids, 0, clamp(factor, 0.05, 6), null);
    }

    const id = ids[0];
    const p  = placements.find(s => s.instanceId === id);
    if (!p) return placements;
    const {width, height} = getRenderedSize(id);
    // Current half-size of the rendered sticker
    const halfSize = Math.max(width, height) * p.scale / 2;
    if (halfSize < 1) return placements;
    const newScale = clamp(p.scale * (halfSize + delta) / halfSize, 0.1, 6);
    return placements.map(pl => pl.instanceId === id ? {...pl, scale: newScale} : pl);
}

export function applyRotationDelta(
    placements: StickerPlacement[],
    ids: string[],
    angleDeg: number,
): StickerPlacement[] {
    if (ids.length === 1) return rotateSingle(placements, ids[0], angleDeg);
    return applyGroupTransform(placements, ids, angleDeg, 1, null);
}

export function applyStretchHandle(
    placements: StickerPlacement[],
    id: string,
    handle: 'n' | 's' | 'e' | 'w',
    dx: number,
    dy: number,
    getRenderedSize: (id: string) => {width: number; height: number},
): StickerPlacement[] {
    const p = placements.find(s => s.instanceId === id);
    if (!p) return placements;
    const pp = p as any;
    const {width, height} = getRenderedSize(id);
    let newScaleX = pp.scaleX ?? 1;
    let newScaleY = pp.scaleY ?? 1;
    // The handle sits at half-width/half-height from center.
    // To make the handle track the mouse 1:1, use ratio: (halfSize + delta) / halfSize
    const halfW = width * p.scale * newScaleX / 2;
    const halfH = height * p.scale * newScaleY / 2;
    if (handle === 'e' && halfW > 0) newScaleX = Math.max(0.1, newScaleX * (halfW + dx) / halfW);
    if (handle === 'w' && halfW > 0) newScaleX = Math.max(0.1, newScaleX * (halfW - dx) / halfW);
    if (handle === 's' && halfH > 0) newScaleY = Math.max(0.1, newScaleY * (halfH + dy) / halfH);
    if (handle === 'n' && halfH > 0) newScaleY = Math.max(0.1, newScaleY * (halfH - dy) / halfH);
    return placements.map(pl => pl.instanceId === id ? {...pl, scaleX: newScaleX, scaleY: newScaleY} : pl);
}

// ── Grouping ─────────────────────────────────────────────────────────────────

export function groupPlacements(placements: StickerPlacement[], ids: string[]): StickerPlacement[] {
    if (ids.length < 2) return placements;
    const groupId = generateGroupId();
    return placements.map(p => ids.includes(p.instanceId) ? {...p, groupId} : p);
}

export function ungroupPlacements(placements: StickerPlacement[], ids: string[]): StickerPlacement[] {
    return placements.map(p => ids.includes(p.instanceId) ? {...p, groupId: undefined} : p);
}

// ── Duplicate ────────────────────────────────────────────────────────────────

export function duplicatePlacements(
    placements: StickerPlacement[],
    ids: string[],
): {updated: StickerPlacement[]; newIds: string[]} {
    const maxZ   = placements.length > 0 ? Math.max(...placements.map(p => p.zIndex)) : 0;
    const copies = ids.flatMap((id, i) => {
        const orig = placements.find(p => p.instanceId === id);
        return orig ? [{...orig, instanceId: generateInstanceId(), x: orig.x + 16, y: orig.y + 16, zIndex: maxZ + i + 1, groupId: undefined}] : [];
    });
    return {updated: [...placements, ...copies], newIds: copies.map(c => c.instanceId)};
}

// ── Selection geometry ────────────────────────────────────────────────────────

/**
 * Computes the bounding box + rotation for the current selection.
 *
 * - Single sticker:      box in sticker-local frame, rotation = sticker.rotation
 * - Persistent group:    box in group-local frame, rotation = average group rotation
 * - Lasso / ad-hoc multi: box in the frame of `overrideRotation` (default 0),
 *   so the overlay can rotate along with accumulated handle drags
 */
export function computeSelectionInfo(
    placements: StickerPlacement[],
    ids: string[],
    getSize: (instanceId: string) => {width: number; height: number},
    overrideRotation = 0,
): {box: BoundingBox; rotation: number} | null {
    if (!ids.length) return null;
    const selected = placements.filter(p => ids.includes(p.instanceId));
    if (!selected.length) return null;

    // ── Single sticker ────────────────────────────────────────────
    if (ids.length === 1) {
        const p  = selected[0];
        const pp = p as any;
        const {width, height} = getSize(p.instanceId);
        const hw = width * p.scale * (pp.scaleX ?? 1) / 2;
        const hh = height * p.scale * (pp.scaleY ?? 1) / 2;
        return {box: {x: p.x - hw, y: p.y - hh, w: hw * 2, h: hh * 2}, rotation: p.rotation};
    }

    // ── Check for persistent group (all share the same non-null groupId) ─────
    const firstGroupId = (selected[0] as any).groupId as string | undefined;
    const isGroup      = !!firstGroupId && selected.every(p => (p as any).groupId === firstGroupId);

    if (isGroup) {
        const rotation = selected.reduce((sum, p) => sum + p.rotation, 0) / selected.length;
        const origin   = centroid(selected.map(p => ({x: p.x, y: p.y})));
        const items    = selected.map(p => {
            const pp = p as any;
            const {width, height} = getSize(p.instanceId);
            return {cx: p.x, cy: p.y, hw: width * p.scale * (pp.scaleX ?? 1) / 2, hh: height * p.scale * (pp.scaleY ?? 1) / 2, itemRad: degToRad(p.rotation)};
        });
        const {minX, minY, maxX, maxY} = rotatedBoundingBox(items, origin, degToRad(rotation));
        return {box: {x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)}, rotation};
    }

    // ── Lasso / ad-hoc multi: envelope in the overrideRotation frame ─────────
    const origin = centroid(selected.map(p => ({x: p.x, y: p.y})));
    const items  = selected.map(p => {
        const pp = p as any;
        const {width, height} = getSize(p.instanceId);
        return {cx: p.x, cy: p.y, hw: width * p.scale * (pp.scaleX ?? 1) / 2, hh: height * p.scale * (pp.scaleY ?? 1) / 2, itemRad: degToRad(p.rotation)};
    });
    const {minX, minY, maxX, maxY} = rotatedBoundingBox(items, origin, degToRad(overrideRotation));
    return {box: {x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)}, rotation: overrideRotation};
}


