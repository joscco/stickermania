import type {StickerPlacement} from '@birthday/shared';
import type {BoundingBox} from './sticker-types';

/**
 * Pure functions for transforming StickerPlacement arrays.
 * No Angular dependencies, no side effects — trivially unit-testable.
 *
 * All functions return a new array; the original is never mutated.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

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
    const cx  = selected.reduce((s, p) => s + p.x, 0) / selected.length;
    const cy  = selected.reduce((s, p) => s + p.y, 0) / selected.length;
    const rad = rotateDeg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);

    return placements.map(p => {
        if (!ids.includes(p.instanceId)) return p;
        let rx = p.x - cx, ry = p.y - cy;
        if (mirrorAxis === 'h') rx = -rx;
        if (mirrorAxis === 'v') ry = -ry;
        const nx = rx * cos - ry * sin;
        const ny = rx * sin + ry * cos;
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
    boundingBoxSize: {w: number; h: number} | null,
    getRenderedSize: (id: string) => {w: number; h: number},
): StickerPlacement[] {
    const signX  = (corner === 'ne' || corner === 'se') ? 1 : -1;
    const signY  = (corner === 'se' || corner === 'sw') ? 1 : -1;
    const delta  = (dx * signX + dy * signY) / 2;

    if (ids.length !== 1) {
        if (!boundingBoxSize || boundingBoxSize.w < 1 || boundingBoxSize.h < 1) return placements;
        const factor = 1 + delta / Math.max(boundingBoxSize.w / 2, boundingBoxSize.h / 2);
        return applyGroupTransform(placements, ids, 0, Math.max(0.05, factor), null);
    }

    const id = ids[0];
    const p  = placements.find(s => s.instanceId === id);
    if (!p) return placements;
    const {w, h} = getRenderedSize(id);
    const refSize  = Math.max(w, h) * p.scale;
    const newScale = clamp(p.scale + (delta / refSize) * p.scale, 0.1, 6);
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
    getRenderedSize: (id: string) => {w: number; h: number},
): StickerPlacement[] {
    const p = placements.find(s => s.instanceId === id);
    if (!p) return placements;
    const pp = p as any;
    const {w, h} = getRenderedSize(id);
    let newScaleX = pp.scaleX ?? 1;
    let newScaleY = pp.scaleY ?? 1;
    if (handle === 'e') newScaleX = Math.max(0.1, newScaleX + dx / (w * p.scale));
    if (handle === 'w') newScaleX = Math.max(0.1, newScaleX - dx / (w * p.scale));
    if (handle === 's') newScaleY = Math.max(0.1, newScaleY + dy / (h * p.scale));
    if (handle === 'n') newScaleY = Math.max(0.1, newScaleY - dy / (h * p.scale));
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
 * Single selection: box is axis-aligned around the sticker center, rotation = sticker rotation.
 * Multi selection: axis-aligned envelope of all rotated corners, rotation = 0.
 */
export function computeSelectionInfo(
    placements: StickerPlacement[],
    ids: string[],
    getSize: (instanceId: string) => {w: number; h: number},
): {box: BoundingBox; rotation: number} | null {
    if (!ids.length) return null;
    const selected = placements.filter(p => ids.includes(p.instanceId));
    if (!selected.length) return null;

    if (ids.length === 1) {
        const p  = selected[0];
        const pp = p as any;
        const {w, h} = getSize(p.instanceId);
        const hw = w * p.scale * (pp.scaleX ?? 1) / 2;
        const hh = h * p.scale * (pp.scaleY ?? 1) / 2;
        return {box: {x: p.x - hw, y: p.y - hh, w: hw * 2, h: hh * 2}, rotation: p.rotation};
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of selected) {
        const pp = p as any;
        const {w, h} = getSize(p.instanceId);
        const hw  = w * p.scale * (pp.scaleX ?? 1) / 2;
        const hh  = h * p.scale * (pp.scaleY ?? 1) / 2;
        const rad = p.rotation * Math.PI / 180;
        const cos = Math.cos(rad), sin = Math.sin(rad);
        for (const [ex, ey] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as [number, number][]) {
            const rx = p.x + ex * cos - ey * sin;
            const ry = p.y + ex * sin + ey * cos;
            if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
        }
    }
    return {box: {x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY)}, rotation: 0};
}

