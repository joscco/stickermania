import type {StickerPlacement} from "@birthday/shared";
import {applyPinchToBaseline, centroid, clampGroupScaleFactor, distance, isPointerOutsideRect, isPositionOutsideCanvas, pinchAngle, pinchDistance, pinchMidpoint} from '../geometry-helpers';
import {LassoHandler} from './lasso-handler';
import type {CanvasSelectionState} from './canvas-selection.state';

export interface ActivePointer { id: number; x: number; y: number; }
export interface GroupBaseline { instanceId: string; baseX: number; baseY: number; baseScale: number; baseRotation: number; relCx: number; relCy: number; }
export interface MoveBaseline { instanceId: string; baseX: number; baseY: number; }

export type GestureCallbacks = {
    onPlacementsChanged: (placements: StickerPlacement[]) => void;
    onLassoPathChanged: (path: {x: number; y: number}[] | null) => void;
    onLassoSelectionChanged: (ids: Set<string>) => void;
    onSelectedChanged: (instanceId: string | null) => void;
    onStickerDraggedOff?: (id: string, allIds: string[]) => void;
    onDragNearEdge?: (outsideCanvas: boolean) => void;
    onPointerUpCommit?: (ids: Set<string>) => void;
    onMoveActiveChanged?: (active: boolean) => void;
    onDoubleTap?: (ids: string[]) => void;
};

export class StickerGestureHandler {
    private pointers: ActivePointer[] = [];
    private lasso: LassoHandler;
    private moveActive = false;
    private moveOffsetX = 0; private moveOffsetY = 0;
    private moveBaselines: MoveBaseline[] = [];
    private didMove = false;
    private pinchBaseDistance = 0; private pinchBaseAngle = 0;
    private pinchBaselines: GroupBaseline[] = [];
    private tapStartX = 0; private tapStartY = 0;
    private tapMoved = false;
    private lastTapTime = 0; private lastTapX = 0; private lastTapY = 0;
    private stickers: StickerPlacement[] = [];
    private sel!: CanvasSelectionState;

    constructor(
        private readonly getCanvasRect: () => DOMRect,
        private readonly hitTest: (cx: number, cy: number) => string | null,
        private readonly cb: GestureCallbacks,
    ) {
        this.lasso = new LassoHandler(
            () => this.stickers,
            {
                onPathChanged: path => this.cb.onLassoPathChanged(path),
                onSelectionChanged: ids => this.cb.onLassoSelectionChanged(ids),
                onSelectedChanged: id => this.cb.onSelectedChanged(id),
            },
        );
    }

    syncState(stickers: StickerPlacement[], sel: CanvasSelectionState): void {
        this.stickers = stickers;
        this.sel = sel;
    }

    onPointerDown(id: number, clientX: number, clientY: number): void {
        this.pointers.push({id, x: clientX, y: clientY});
        if (this.pointers.length === 2) {
            this.tapMoved = true; this.lasso.cancel(); this.moveActive = false;
            const ids = this.currentSelectionIds();
            if (ids.length > 0) this.initPinch(ids);
            return;
        }
        this.tapStartX = clientX; this.tapStartY = clientY;
        this.tapMoved = false; this.didMove = false;
        const rect = this.getCanvasRect();
        const hitId = this.hitTest(clientX, clientY);

        if (hitId) {
            if (!this.hasSelection()) this.selectAndMove(hitId, clientX - rect.left, clientY - rect.top);
            else if (!this.isSelected(hitId)) this.selectAndMove(hitId, clientX - rect.left, clientY - rect.top);
            else this.startMove(clientX - rect.left, clientY - rect.top);
        } else {
            this.sel?.selectedInstanceId.set(null);
            this.sel?.lassoSelection.set(new Set());
            this.cb.onSelectedChanged(null);
            this.cb.onLassoSelectionChanged(new Set());
            this.lasso.start(clientX - rect.left, clientY - rect.top);
        }
    }

    onPointerMove(id: number, clientX: number, clientY: number): void {
        const idx = this.pointers.findIndex(p => p.id === id);
        if (idx < 0) return;
        this.pointers[idx] = {id, x: clientX, y: clientY};
        if (!this.tapMoved && Math.hypot(clientX - this.tapStartX, clientY - this.tapStartY) > 6) this.tapMoved = true;
        const rect = this.getCanvasRect();

        if (this.pointers.length === 2 && this.pinchBaselines.length > 0) { this.applyPinch(); this.didMove = true; return; }
        if (this.moveActive && this.pointers.length === 1) {
            const dx = clientX - rect.left - this.moveOffsetX;
            const dy = clientY - rect.top - this.moveOffsetY;
            const updated = this.stickers.map(p => {
                const b = this.moveBaselines.find(b => b.instanceId === p.instanceId);
                return b ? {...p, x: b.baseX + dx, y: b.baseY + dy} : p;
            });
            this.cb.onPlacementsChanged(updated);
            this.didMove = true;
            if (this.cb.onDragNearEdge && this.hasSelection())
                this.cb.onDragNearEdge(this.isPointerOrCentroidNotOnCanvas(clientX, clientY, rect, updated));
            return;
        }
        if (this.lasso.isActive() && this.pointers.length === 1) this.lasso.addPoint(clientX - rect.left, clientY - rect.top);
    }

    onPointerUp(id: number, clientX: number, clientY: number): void {
        this.pointers = this.pointers.filter(p => p.id !== id);
        if (this.pointers.length === 0) {
            if (this.moveActive && this.tapMoved && this.cb.onStickerDraggedOff) {
                const rect = this.getCanvasRect();
                const dx = clientX - rect.left - this.moveOffsetX;
                const dy = clientY - rect.top - this.moveOffsetY;
                const fp = this.stickers.map(p => {
                    const b = this.moveBaselines.find(b => b.instanceId === p.instanceId);
                    return b ? {...p, x: b.baseX + dx, y: b.baseY + dy} : p;
                });
                if (this.isPointerOrCentroidNotOnCanvas(clientX, clientY, rect, fp) && this.hasSelection()) {
                    const ids = this.currentSelectionIds();
                    this.sel?.selectedInstanceId.set(null);
                    this.sel?.lassoSelection.set(new Set());
                    this.moveActive = false; this.moveBaselines = [];
                    this.cb.onMoveActiveChanged?.(false);
                    this.cb.onSelectedChanged(null);
                    this.cb.onLassoSelectionChanged(new Set());
                    this.cb.onStickerDraggedOff(ids[0], ids);
                    return;
                }
            }
            if (this.didMove) this.cb.onPointerUpCommit?.(new Set(this.currentSelectionIds()));
            this.lasso.finalize();
            this.moveActive = false; this.moveBaselines = []; this.pinchBaselines = [];
            this.didMove = false;
            this.cb.onMoveActiveChanged?.(false);
            this.cb.onDragNearEdge?.(false);
            if (!this.tapMoved && this.hasSelection()) {
                const now = Date.now();
                if (now - this.lastTapTime < 350 && distance(clientX, clientY, this.lastTapX, this.lastTapY) < 30) {
                    this.cb.onDoubleTap?.(this.currentSelectionIds());
                    this.lastTapTime = 0;
                } else { this.lastTapTime = now; this.lastTapX = clientX; this.lastTapY = clientY; }
            }
        }
        if (this.pointers.length === 1 && this.moveActive) {
            const r = this.pointers[0]; const rect = this.getCanvasRect();
            this.moveOffsetX = r.x - rect.left; this.moveOffsetY = r.y - rect.top;
            this.moveBaselines = this.selectedStickers().map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
            this.pinchBaselines = [];
        }
    }

    private hasSelection(): boolean { return this.sel?.hasSelection() ?? false; }
    private isSelected(id: string): boolean { return this.sel?.isSelected(id) ?? false; }

    private currentSelectionIds(): string[] {
        return this.sel?.selectionIds() ?? [];
    }

    private selectedStickers(): StickerPlacement[] {
        return this.stickers.filter(p => this.isSelected(p.instanceId));
    }

    private resolveHit(hitId: string): string[] {
        const hit = this.stickers.find(p => p.instanceId === hitId);
        if (hit?.groupId) return this.stickers.filter(p => p.groupId === hit.groupId).map(p => p.instanceId);
        return [hitId];
    }

    private selectAndMove(hitId: string, localX: number, localY: number): void {
        const ids = this.resolveHit(hitId);
        if (ids.length > 1) { this.sel?.lassoSelection.set(new Set(ids)); this.sel?.selectedInstanceId.set(null); this.cb.onLassoSelectionChanged(new Set(ids)); }
        else { this.sel?.selectedInstanceId.set(hitId); this.sel?.lassoSelection.set(new Set()); this.cb.onSelectedChanged(hitId); this.cb.onLassoSelectionChanged(new Set()); }
        this.startMove(localX, localY);
    }

    private startMove(localX: number, localY: number): void {
        this.moveActive = true; this.moveOffsetX = localX; this.moveOffsetY = localY;
        this.moveBaselines = this.selectedStickers().map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
    }

    private isPointerOrCentroidNotOnCanvas(cx: number, cy: number, rect: DOMRect, placements?: StickerPlacement[]): boolean {
        if (isPointerOutsideRect(cx, cy, rect)) return true;
        const sel = (placements ?? this.stickers).filter(p => this.isSelected(p.instanceId));
        if (!sel.length) return false;
        const c = centroid(sel);
        return isPositionOutsideCanvas(c.x, c.y, rect);
    }

    private initPinch(ids: string[]): void {
        if (this.pointers.length < 2) return;
        const [a, b] = this.pointers;
        const pp = {ax: a.x, ay: a.y, bx: b.x, by: b.y};
        const rect = this.getCanvasRect();
        this.pinchBaseDistance = pinchDistance(pp);
        this.pinchBaseAngle = pinchAngle(pp);
        const mid = pinchMidpoint(pp, rect);
        this.pinchBaselines = ids
            .map(iid => this.stickers.find(p => p.instanceId === iid))
            .filter((p): p is StickerPlacement => !!p)
            .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y, baseScale: p.scale, baseRotation: p.rotation, relCx: p.x - mid.x, relCy: p.y - mid.y}));
    }

    private applyPinch(): void {
        if (this.pointers.length < 2 || !this.pinchBaselines.length) return;
        const [a, b] = this.pointers;
        const pp = {ax: a.x, ay: a.y, bx: b.x, by: b.y};
        const mid = pinchMidpoint(pp, this.getCanvasRect());
        const factor = clampGroupScaleFactor(pinchDistance(pp) / this.pinchBaseDistance, this.pinchBaselines.map(bl => bl.baseScale));
        this.cb.onPlacementsChanged(this.stickers.map(p => {
            const base = this.pinchBaselines.find(b => b.instanceId === p.instanceId);
            return base ? {...p, ...applyPinchToBaseline(base, this.pinchBaseAngle, factor, pp, mid)} : p;
        }));
    }
}
