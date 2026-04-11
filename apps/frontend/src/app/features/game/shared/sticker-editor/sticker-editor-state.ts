import {computed, signal} from '@angular/core';
import type {StickerPlacement} from '@birthday/shared';

export type SelectionMode =
    | 'idle'
    | 'single'
    | 'group'
    | 'multi'
    | 'moving'
    | 'scaling'
    | 'rotating'
    | 'stretching'
    | 'lasso';

/** Axis-aligned bounding box in canvas-local pixels. */
export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Lightweight selection + editor-mode state store.
 * Instantiated once per StickerEditorComponent (not a singleton service).
 */
export class EditorSelectionState {
    readonly mode           = signal<SelectionMode>('idle');
    readonly selectedId     = signal<string | null>(null);
    readonly lassoSet        = signal<Set<string>>(new Set());
    readonly stretchMode    = signal<boolean>(false);
    /** True while the context menu should be visible. */
    readonly menuVisible    = signal<boolean>(false);

    // ── Derived ───────────────────────────────────────────────────

    readonly hasSelection = computed(() =>
        !!this.selectedId() || this.lassoSet().size > 0,
    );

    readonly selectionIds = computed<string[]>(() => {
        const s = this.lassoSet();
        if (s.size > 0) return [...s];
        const id = this.selectedId();
        return id ? [id] : [];
    });

    readonly isMulti = computed(() => this.lassoSet().size > 1);

    /** Bounding box of selected placements in canvas-local px. p.x/p.y = visual center. */
    boundingBoxFor(
        placements: StickerPlacement[],
        getStickerSize: (instanceId: string) => {w: number; h: number},
    ): BoundingBox | null {
        const ids = this.selectionIds();
        if (!ids.length) return null;
        const selected = placements.filter(p => ids.includes(p.instanceId));
        if (!selected.length) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of selected) {
            const {w, h} = getStickerSize(p.instanceId);
            const pp = p as any;
            const hw = w * p.scale * (pp.scaleX ?? 1) / 2;
            const hh = h * p.scale * (pp.scaleY ?? 1) / 2;
            minX = Math.min(minX, p.x - hw); maxX = Math.max(maxX, p.x + hw);
            minY = Math.min(minY, p.y - hh); maxY = Math.max(maxY, p.y + hh);
        }
        return {x: minX, y: minY, w: maxX - minX, h: maxY - minY};
    }

    // ── Mutators ──────────────────────────────────────────────────

    selectSingle(id: string): void {
        this.selectedId.set(id);
        this.lassoSet.set(new Set());
        this.mode.set('single');
        this.stretchMode.set(false);
        this.menuVisible.set(false);
    }

    selectGroup(ids: string[]): void {
        this.selectedId.set(null);
        this.lassoSet.set(new Set(ids));
        this.mode.set('group');
        this.stretchMode.set(false);
        this.menuVisible.set(false);
    }

    selectLasso(ids: string[]): void {
        if (ids.length === 0) {
            this.clear();
        } else if (ids.length === 1) {
            this.selectSingle(ids[0]);
        } else {
            this.selectedId.set(null);
            this.lassoSet.set(new Set(ids));
            this.mode.set('multi');
            this.stretchMode.set(false);
            this.menuVisible.set(false);
        }
    }

    clear(): void {
        this.selectedId.set(null);
        this.lassoSet.set(new Set());
        this.mode.set('idle');
        this.stretchMode.set(false);
        this.menuVisible.set(false);
    }

    toggleMenu(): void {
        this.menuVisible.set(!this.menuVisible());
    }


    hideMenu(): void {
        this.menuVisible.set(false);
    }
}

