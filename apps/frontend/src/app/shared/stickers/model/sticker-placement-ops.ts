import type {StickerPlacement} from '@birthday/shared';
import {SelectionInfo} from './types';
import {centroid, clamp, clampGroupScaleFactor, degToRad, MAX_SCALE, MIN_SCALE, rotatedBoundingBox, rotateVec} from './geometry-helpers';

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
    const sorted = orderedPlacements(placements);
    const groupSet = new Set(ids);
    const outside  = sorted.filter(item => !groupSet.has(item.placement.instanceId));
    const inside   = sorted.filter(item =>  groupSet.has(item.placement.instanceId));
    if (!inside.length) return placements;
    if (!outside.length) return normalizeZIndexes(placements);

    if (direction > 0) {
        const maxGroupOrder = Math.max(...inside.map(item => item.order));
        const neighbor = outside.find(item => item.order > maxGroupOrder);
        if (!neighbor) return normalizeZIndexes(placements);
        const targetIndex = outside.findIndex(item => item.placement.instanceId === neighbor.placement.instanceId);
        return assignZIndexes(placements, insertItems(outside, inside, targetIndex + 1));
    }

    const minGroupOrder = Math.min(...inside.map(item => item.order));
    const neighbor = [...outside].reverse().find(item => item.order < minGroupOrder);
    if (!neighbor) return normalizeZIndexes(placements);
    const targetIndex = outside.findIndex(item => item.placement.instanceId === neighbor.placement.instanceId);
    return assignZIndexes(placements, insertItems(outside, inside, targetIndex));
}

export function moveToEdge(placements: StickerPlacement[], ids: string[], edge: 'front' | 'back'): StickerPlacement[] {
    const sorted = orderedPlacements(placements);
    const groupSet = new Set(ids);
    const outside = sorted.filter(item => !groupSet.has(item.placement.instanceId));
    const inside = sorted.filter(item => groupSet.has(item.placement.instanceId));
    if (!inside.length) return placements;

    const nextOrder = edge === 'front'
        ? [...outside, ...inside]
        : [...inside, ...outside];

    return assignZIndexes(placements, nextOrder);
}

type OrderedPlacement = {placement: StickerPlacement; order: number};

export function normalizeZIndexes(placements: StickerPlacement[]): StickerPlacement[] {
    return assignZIndexes(placements, orderedPlacements(placements));
}

function orderedPlacements(placements: StickerPlacement[]): OrderedPlacement[] {
    return placements
        .map((placement, stableIndex) => ({placement, stableIndex}))
        .sort((a, b) => a.placement.zIndex - b.placement.zIndex || a.stableIndex - b.stableIndex)
        .map(({placement}, order) => ({placement, order}));
}

function insertItems(outside: OrderedPlacement[], inside: OrderedPlacement[], index: number): OrderedPlacement[] {
    return [
        ...outside.slice(0, index),
        ...inside,
        ...outside.slice(index),
    ];
}

function assignZIndexes(placements: StickerPlacement[], order: OrderedPlacement[]): StickerPlacement[] {
    const zById = new Map(order.map((item, index) => [item.placement.instanceId, index + 1]));

    return placements.map(placement => {
        const zIndex = zById.get(placement.instanceId);
        return zIndex === undefined || zIndex === placement.zIndex
            ? placement
            : {...placement, zIndex};
    });
}

// ── Scale / Rotate / Mirror ───────────────────────────────────────────────────

export function rotateSingle(placements: StickerPlacement[], id: string, degrees: number): StickerPlacement[] {
    return placements.map(p => p.instanceId === id ? {...p, rotation: p.rotation + degrees} : p);
}

export function scaleSingle(placements: StickerPlacement[], id: string, factor: number, minScale = MIN_SCALE, maxScale = MAX_SCALE): StickerPlacement[] {
    return placements.map(p => p.instanceId === id
        ? {...p, scale: clamp(p.scale * factor, minScale, maxScale)}
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
    minScale = MIN_SCALE,
    maxScale = MAX_SCALE,
): StickerPlacement[] {
    const selected = placements.filter(p => ids.includes(p.instanceId));
    if (!selected.length) return placements;
    const {x: cx, y: cy} = centroid(selected.map(p => ({x: p.x, y: p.y})));
    const rad = degToRad(rotateDeg);

    // Clamp scaleFactor at group level so ALL stickers stay within limits
    const clampedFactor = clampGroupScaleFactor(scaleFactor, selected.map(p => p.scale), minScale, maxScale);

    return placements.map(p => {
        if (!ids.includes(p.instanceId)) return p;
        let rx = p.x - cx, ry = p.y - cy;
        if (mirrorAxis === 'h') rx = -rx;
        if (mirrorAxis === 'v') ry = -ry;
        const {x: nx, y: ny} = rotateVec(rx, ry, rad);
        return {
            ...p,
            x:        cx + nx * clampedFactor,
            y:        cy + ny * clampedFactor,
            scale:    p.scale * clampedFactor,
            rotation: p.rotation + rotateDeg,
            ...(mirrorAxis === 'h' ? {flipX: !p.flipX} : {}),
            ...(mirrorAxis === 'v' ? {flipY: !p.flipY} : {}),
        };
    });
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
    minScale = MIN_SCALE,
    maxScale = MAX_SCALE,
): StickerPlacement[] {
    const p = placements.find(s => s.instanceId === id);
    if (!p) return placements;
    const {width, height} = getRenderedSize(id);
    let newScaleX = p.scaleX ?? 1;
    let newScaleY = p.scaleY ?? 1;
    const halfW = width * p.scale * newScaleX / 2;
    const halfH = height * p.scale * newScaleY / 2;
    if (handle === 'e' && halfW > 0) newScaleX = Math.max(0.1, newScaleX * (halfW + dx) / halfW);
    if (handle === 'w' && halfW > 0) newScaleX = Math.max(0.1, newScaleX * (halfW - dx) / halfW);
    if (handle === 's' && halfH > 0) newScaleY = Math.max(0.1, newScaleY * (halfH + dy) / halfH);
    if (handle === 'n' && halfH > 0) newScaleY = Math.max(0.1, newScaleY * (halfH - dy) / halfH);
    const safeBaseScale = Math.max(0.001, p.scale);
    newScaleX = clamp(newScaleX, minScale / safeBaseScale, maxScale / safeBaseScale);
    newScaleY = clamp(newScaleY, minScale / safeBaseScale, maxScale / safeBaseScale);
    return placements.map(pl => pl.instanceId === id ? {...pl, scaleX: newScaleX, scaleY: newScaleY} : pl);
}

// ── Duplicate ────────────────────────────────────────────────────────────────

/**
 * Duplicate the selected stickers.
 *
 * - Preserves relative z-order among the duplicated stickers.
 * - If the originals share a groupId, the copies get a **new** shared groupId
 *   so they form their own group.
 * - Respects `maxStickers`: if duplicating all would exceed the limit, only as
 *   many as fit are copied (in z-order). Pass `Infinity` to skip the check.
 */
export function duplicatePlacements(
    placements: StickerPlacement[],
    ids: string[],
): {updated: StickerPlacement[]; newIds: string[]} {
    // Sort originals by zIndex so copies keep relative order
    const originals = ids
        .map(id => placements.find(p => p.instanceId === id))
        .filter((p): p is StickerPlacement => !!p)
        .sort((a, b) => a.zIndex - b.zIndex);

    // Limit to available slots
    const toCopy = originals.slice(0);
    if (!toCopy.length) return {updated: placements, newIds: []};

    // Build a mapping from old groupId → new groupId so grouped stickers
    // stay grouped in the copy.
    const groupIdMap = new Map<string, string>();
    for (const orig of toCopy) {
        const gid = orig.groupId;
        if (gid && !groupIdMap.has(gid)) {
            groupIdMap.set(gid, generateGroupId());
        }
    }

    const maxZ = placements.length > 0 ? Math.max(...placements.map(p => p.zIndex)) : 0;

    const copies = toCopy.map((orig, i) => {
        const newGroup = orig.groupId ? groupIdMap.get(orig.groupId) : undefined;
        return {
            ...orig,
            instanceId: generateInstanceId(),
            x: orig.x + 16,
            y: orig.y + 16,
            zIndex: maxZ + i + 1,
            groupId: newGroup,
        };
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
): SelectionInfo | null {
    if (!ids.length) return null;
    const selected = placements.filter(p => ids.includes(p.instanceId));
    if (!selected.length) return null;

    // ── Single sticker ────────────────────────────────────────────
    if (ids.length === 1) {
        const p  = selected[0];
        const {width, height} = getSize(p.instanceId);
        const hw = width * p.scale * (p.scaleX ?? 1) / 2;
        const hh = height * p.scale * (p.scaleY ?? 1) / 2;
        return new SelectionInfo({x: p.x - hw, y: p.y - hh, w: hw * 2, h: hh * 2}, p.rotation);
    }

    // ── Check for persistent group (all share the same non-null groupId) ─────
    const firstGroupId = selected[0].groupId;
    const isGroup      = !!firstGroupId && selected.every(p => p.groupId === firstGroupId);

    if (isGroup) {
        const rotation = selected.reduce((sum, p) => sum + p.rotation, 0) / selected.length;
        const origin   = centroid(selected.map(p => ({x: p.x, y: p.y})));
        const items    = selected.map(p => {
            const {width, height} = getSize(p.instanceId);
            return {cx: p.x, cy: p.y, hw: width * p.scale * (p.scaleX ?? 1) / 2, hh: height * p.scale * (p.scaleY ?? 1) / 2, itemRad: degToRad(p.rotation)};
        });
        const {minX, minY, maxX, maxY} = rotatedBoundingBox(items, origin, degToRad(rotation));
        return new SelectionInfo({x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)}, rotation);
    }

    // ── Lasso / ad-hoc multi: envelope in the overrideRotation frame ─────────
    const origin = centroid(selected.map(p => ({x: p.x, y: p.y})));
    const items  = selected.map(p => {
        const {width, height} = getSize(p.instanceId);
        return {cx: p.x, cy: p.y, hw: width * p.scale * (p.scaleX ?? 1) / 2, hh: height * p.scale * (p.scaleY ?? 1) / 2, itemRad: degToRad(p.rotation)};
    });
    const {minX, minY, maxX, maxY} = rotatedBoundingBox(items, origin, degToRad(overrideRotation));
    return new SelectionInfo({x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)}, overrideRotation);
}
