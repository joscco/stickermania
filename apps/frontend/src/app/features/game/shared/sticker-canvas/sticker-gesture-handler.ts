import type {StickerPlacement} from "@birthday/shared";
import {pointInPolygon} from "./sticker-hit-test.util";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ActivePointer {
    id: number;
    x: number;
    y: number;
}

export interface GroupBaseline {
    instanceId: string;
    baseX: number;
    baseY: number;
    baseScale: number;
    baseRotation: number;
    /** Vector from gesture center to sticker center at gesture start */
    relCx: number;
    relCy: number;
}

export interface MoveBaseline {
    instanceId: string;
    baseX: number;
    baseY: number;
}

export type GestureCallbacks = {
    /** Called whenever sticker placements change (move / pinch). */
    onPlacementsChanged: (placements: StickerPlacement[]) => void;
    /** Called when the lasso path changes during drawing. */
    onLassoPathChanged: (path: {x: number; y: number}[] | null) => void;
    /** Called when lasso selection resolves to a set of instanceIds. */
    onLassoSelectionChanged: (ids: Set<string>) => void;
    /** Called when the single selected sticker changes. */
    onSelectedChanged: (instanceId: string | null) => void;
    /** Called when sticker(s) are dragged off the canvas edge — should be deleted. First arg is primary id, second is full list. */
    onStickerDraggedOff?: (id: string, allIds: string[]) => void;
    /** Called during move when the pointer crosses outside/inside the canvas boundary. */
    onDragNearEdge?: (outsideCanvas: boolean) => void;
};

// ── GestureHandler ───────────────────────────────────────────────────────────

/**
 * Handles all touch/pointer/gesture logic for the sticker canvas.
 *
 * Interaction model:
 *
 * IDLE (nothing selected):
 *   - tap sticker          → select it
 *   - drag on empty area   → draw freehand lasso
 *
 * SELECTION ACTIVE:
 *   - 1 finger anywhere    → move selection
 *   - 2 fingers anywhere   → pinch-scale + rotate selection
 *   - tap empty area       → deselect
 *   - tap other sticker    → switch selection
 */
export class StickerGestureHandler {
    private pointers: ActivePointer[] = [];

    // Lasso state
    private lassoActive = false;
    private lassoPath: {x: number; y: number}[] = [];

    // Move state
    private moveActive = false;
    private moveOffsetX = 0;
    private moveOffsetY = 0;
    private moveBaselines: MoveBaseline[] = [];

    // Pinch state
    private pinchBaseDistance = 0;
    private pinchBaseAngle = 0;
    private pinchBaselines: GroupBaseline[] = [];

    // Tap detection
    private tapStartX = 0;
    private tapStartY = 0;
    private tapStartTime = 0;
    private tapMoved = false;

    // Current snapshot of stickers (updated from outside on every change)
    private stickers: StickerPlacement[] = [];
    private selectedInstanceId: string | null = null;
    private lassoSelection: Set<string> = new Set();

    constructor(
        private readonly getCanvasRect: () => DOMRect,
        private readonly hitTest: (clientX: number, clientY: number) => string | null,
        private readonly getStickerRenderedSize: (instanceId: string) => {w: number; h: number},
        private readonly callbacks: GestureCallbacks,
    ) {}

    // ── Public state sync ─────────────────────────────────────────

    public syncState(
        stickers: StickerPlacement[],
        selectedInstanceId: string | null,
        lassoSelection: Set<string>,
    ): void {
        this.stickers = stickers;
        this.selectedInstanceId = selectedInstanceId;
        this.lassoSelection = lassoSelection;
    }

    // ── Pointer events ────────────────────────────────────────────

    public onPointerDown(id: number, clientX: number, clientY: number): void {
        this.pointers.push({id, x: clientX, y: clientY});

        // Second finger → upgrade to pinch
        if (this.pointers.length === 2) {
            this.tapMoved = true;
            this.lassoActive = false;
            this.callbacks.onLassoPathChanged(null);
            this.moveActive = false;

            const ids = this.currentSelectionIds();
            if (ids.length > 0) this.initPinch(ids);
            return;
        }

        // First finger
        this.tapStartX    = clientX;
        this.tapStartY    = clientY;
        this.tapStartTime = performance.now();
        this.tapMoved     = false;

        const rect   = this.getCanvasRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const hitId  = this.hitTest(clientX, clientY);

        if (this.hasSelection()) {
            if (hitId && !this.isSelected(hitId)) {
                // Tapped a different sticker → switch selection
                this.callbacks.onLassoSelectionChanged(new Set());
                this.callbacks.onSelectedChanged(hitId);
                this.selectedInstanceId = hitId;
                this.lassoSelection = new Set();
            }
            this.startMove(localX, localY);
        } else if (hitId) {
            this.callbacks.onSelectedChanged(hitId);
            this.callbacks.onLassoSelectionChanged(new Set());
            this.selectedInstanceId = hitId;
            this.lassoSelection = new Set();
            this.startMove(localX, localY);
        } else {
            // Empty area → draw lasso
            this.lassoActive = true;
            this.lassoPath   = [{x: localX, y: localY}];
            this.callbacks.onLassoPathChanged([...this.lassoPath]);
        }
    }

    public onPointerMove(id: number, clientX: number, clientY: number): void {
        const idx = this.pointers.findIndex(p => p.id === id);
        if (idx < 0) return;
        this.pointers[idx] = {id, x: clientX, y: clientY};

        if (!this.tapMoved) {
            if (Math.hypot(clientX - this.tapStartX, clientY - this.tapStartY) > 6) {
                this.tapMoved = true;
            }
        }

        const rect   = this.getCanvasRect();
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;

        if (this.pointers.length === 2 && this.pinchBaselines.length > 0) {
            this.applyPinch();
            return;
        }

        if (this.moveActive && this.pointers.length === 1) {
            const dx = localX - this.moveOffsetX;
            const dy = localY - this.moveOffsetY;
            this.callbacks.onPlacementsChanged(
                this.stickers.map(p => {
                    const base = this.moveBaselines.find(b => b.instanceId === p.instanceId);
                    return base ? {...p, x: base.baseX + dx, y: base.baseY + dy} : p;
                }),
            );
            // Signal whether the drag has left the canvas boundary (single or group)
            if (this.callbacks.onDragNearEdge && this.hasSelection()) {
                const outside = clientX < rect.left || clientX > rect.right ||
                                clientY < rect.top  || clientY > rect.bottom;
                this.callbacks.onDragNearEdge(outside);
            }
            return;
        }

        if (this.lassoActive && this.pointers.length === 1) {
            this.lassoPath.push({x: localX, y: localY});
            this.callbacks.onLassoPathChanged([...this.lassoPath]);
        }
    }

    public onPointerUp(id: number, clientX: number, clientY: number): void {
        this.pointers = this.pointers.filter(p => p.id !== id);

        if (this.pointers.length === 0) {
            // Check if selection was dragged off the canvas edge
            if (this.moveActive && this.tapMoved && this.callbacks.onStickerDraggedOff) {
                const rect = this.getCanvasRect();
                const outside = clientX < rect.left || clientX > rect.right ||
                                clientY < rect.top  || clientY > rect.bottom;
                if (outside && this.hasSelection()) {
                    // Collect ids to delete before clearing state
                    const ids = this.currentSelectionIds();
                    this.selectedInstanceId = null;
                    this.lassoSelection = new Set();
                    this.moveActive = false;
                    this.moveBaselines = [];
                    this.callbacks.onSelectedChanged(null);
                    this.callbacks.onLassoSelectionChanged(new Set());
                    // Notify in a single batch call rather than one per id
                    this.callbacks.onDragNearEdge?.(false);
                    this.callbacks.onStickerDraggedOff(ids[0], ids);
                    return;
                }
            }

            this.finaliseLasso();
            this.handleTapDeselect(clientX, clientY);
            this.moveActive      = false;
            this.moveBaselines   = [];
            this.pinchBaselines  = [];
            this.callbacks.onDragNearEdge?.(false);
        }

        // Re-anchor move when going 2 → 1 finger
        if (this.pointers.length === 1 && this.moveActive) {
            const remaining = this.pointers[0];
            const rect = this.getCanvasRect();
            this.moveOffsetX  = remaining.x - rect.left;
            this.moveOffsetY  = remaining.y - rect.top;
            this.moveBaselines = this.selectedStickers()
                .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
            this.pinchBaselines = [];
        }
    }

    // ── Private helpers ───────────────────────────────────────────

    private hasSelection(): boolean {
        return !!this.selectedInstanceId || this.lassoSelection.size > 0;
    }

    private isSelected(instanceId: string): boolean {
        return this.selectedInstanceId === instanceId || this.lassoSelection.has(instanceId);
    }

    private currentSelectionIds(): string[] {
        if (this.lassoSelection.size > 0) return [...this.lassoSelection];
        return this.selectedInstanceId ? [this.selectedInstanceId] : [];
    }

    private selectedStickers(): StickerPlacement[] {
        return this.stickers.filter(p => this.isSelected(p.instanceId));
    }

    private startMove(localX: number, localY: number): void {
        this.moveActive    = true;
        this.moveOffsetX   = localX;
        this.moveOffsetY   = localY;
        this.moveBaselines = this.selectedStickers()
            .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
    }

    private finaliseLasso(): void {
        if (!this.lassoActive) return;

        if (this.lassoPath.length > 3) {
            const captured = this.stickers.filter(p =>
                this.stickerCentreInLasso(p, this.lassoPath)
            );
            if (captured.length > 1) {
                this.callbacks.onLassoSelectionChanged(new Set(captured.map(p => p.instanceId)));
                this.callbacks.onSelectedChanged(null);
            } else if (captured.length === 1) {
                this.callbacks.onSelectedChanged(captured[0].instanceId);
                this.callbacks.onLassoSelectionChanged(new Set());
            }
        }

        this.lassoPath  = [];
        this.lassoActive = false;
        this.callbacks.onLassoPathChanged(null);
    }

    private handleTapDeselect(clientX: number, clientY: number): void {
        const elapsed = performance.now() - this.tapStartTime;
        if (!this.tapMoved && elapsed < 300) {
            if (!this.hitTest(clientX, clientY)) {
                this.callbacks.onSelectedChanged(null);
                this.callbacks.onLassoSelectionChanged(new Set());
            }
        }
    }

    // ── Pinch ─────────────────────────────────────────────────────

    private initPinch(ids: string[]): void {
        if (this.pointers.length < 2) return;
        const [a, b] = this.pointers;
        this.pinchBaseDistance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.pinchBaseAngle    = Math.atan2(b.y - a.y, b.x - a.x);

        const rect     = this.getCanvasRect();
        const cx       = ((a.x + b.x) / 2) - rect.left;
        const cy       = ((a.y + b.y) / 2) - rect.top;

        this.pinchBaselines = ids
            .map(iid => this.stickers.find(p => p.instanceId === iid))
            .filter((p): p is StickerPlacement => !!p)
            .map(p => {
                const {w: imgW, h: imgH} = this.getStickerRenderedSize(p.instanceId);
                const scaledW = imgW * p.scale;
                const scaledH = imgH * p.scale;
                return {
                    instanceId:   p.instanceId,
                    baseX:        p.x,
                    baseY:        p.y,
                    baseScale:    p.scale,
                    baseRotation: p.rotation,
                    relCx: (p.x + scaledW / 2) - cx,
                    relCy: (p.y + scaledH / 2) - cy,
                };
            });
    }

    private applyPinch(): void {
        if (this.pointers.length < 2 || this.pinchBaselines.length === 0) return;
        const [a, b] = this.pointers;

        const newDist     = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const newAngle    = Math.atan2(b.y - a.y, b.x - a.x);
        const scaleFactor = newDist / this.pinchBaseDistance;
        const angleDelta  = (newAngle - this.pinchBaseAngle) * (180 / Math.PI);
        const angleRad    = newAngle - this.pinchBaseAngle;

        const rect  = this.getCanvasRect();
        const cx    = ((a.x + b.x) / 2) - rect.left;
        const cy    = ((a.y + b.y) / 2) - rect.top;
        const cos   = Math.cos(angleRad);
        const sin   = Math.sin(angleRad);

        this.callbacks.onPlacementsChanged(
            this.stickers.map(p => {
                const base = this.pinchBaselines.find(b => b.instanceId === p.instanceId);
                if (!base) return p;

                const newScale    = Math.max(0.2, Math.min(4, base.baseScale * scaleFactor));
                const newRotation = base.baseRotation + angleDelta;

                // Rotate + scale the relative-center vector around the gesture center
                const newRelCx = (base.relCx * cos - base.relCy * sin) * scaleFactor;
                const newRelCy = (base.relCx * sin + base.relCy * cos) * scaleFactor;

                const {w: imgW, h: imgH} = this.getStickerRenderedSize(p.instanceId);
                const scaledW = imgW * newScale;
                const scaledH = imgH * newScale;

                return {
                    ...p,
                    scale:    newScale,
                    rotation: newRotation,
                    x: cx + newRelCx - scaledW / 2,
                    y: cy + newRelCy - scaledH / 2,
                };
            }),
        );
    }

    // ── Lasso hit detection ───────────────────────────────────────

    private stickerCentreInLasso(
        placement: StickerPlacement,
        path: {x: number; y: number}[],
    ): boolean {
        const {w: imgW, h: imgH} = this.getStickerRenderedSize(placement.instanceId);
        const cx = placement.x + (imgW * placement.scale) / 2;
        const cy = placement.y + (imgH * placement.scale) / 2;
        return pointInPolygon(cx, cy, path);
    }
}

