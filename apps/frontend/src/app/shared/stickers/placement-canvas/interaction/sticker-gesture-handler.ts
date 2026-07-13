import type {StickerPlacement} from "@birthday/shared";
import type {CanvasSelectionState} from '../state/canvas-selection.state';

export interface ActivePointer { id: number; x: number; y: number; }
export interface MoveBaseline { instanceId: string; baseX: number; baseY: number; }

export type GestureCallbacks = {
    onPlacementsChanged: (placements: StickerPlacement[]) => void;
    onSelectedChanged: (instanceId: string | null) => void;
    onPointerUpCommit?: (ids: Set<string>) => void;
    onMoveActiveChanged?: (active: boolean) => void;
    onMovePointerChanged?: (point: {clientX: number; clientY: number}) => void;
    clampPlacements?: (placements: StickerPlacement[], movingIds: string[]) => StickerPlacement[];
};

export class StickerGestureHandler {
    private pointers: ActivePointer[] = [];
    private moveActive = false;
    private moveOffsetX = 0; private moveOffsetY = 0;
    private moveBaselines: MoveBaseline[] = [];
    private didMove = false;
    private stickers: StickerPlacement[] = [];
    private sel!: CanvasSelectionState;

    constructor(
        private readonly getCanvasRect: () => DOMRect,
        private readonly hitTest: (cx: number, cy: number) => string | null,
        private readonly cb: GestureCallbacks,
        private readonly canInteractWithSticker: (instanceId: string) => boolean = () => true,
        private readonly consumeSelectionClear: () => boolean = () => true,
    ) {}

    syncState(stickers: StickerPlacement[], sel: CanvasSelectionState): void {
        this.stickers = stickers;
        this.sel = sel;
    }

    hitIdAt(clientX: number, clientY: number): string | null {
        return this.hitTest(clientX, clientY);
    }

    onPointerDown(id: number, clientX: number, clientY: number): boolean {
        this.pointers.push({id, x: clientX, y: clientY});
        if (this.pointers.length === 2) {
            this.cancelInteraction(true);
            this.clearSelection();
            return false;
        }
        this.didMove = false;
        const rect = this.getCanvasRect();
        const hitId = this.editableHitId(this.hitIdAt(clientX, clientY));

        if (hitId) {
            if (this.isSelected(hitId)) {
                this.startMove(clientX - rect.left, clientY - rect.top);
            } else {
                this.selectOnly(hitId);
                this.startMove(clientX - rect.left, clientY - rect.top);
            }
        } else {
            const hadSelection = this.hasSelection();
            this.stopMove();
            if (hadSelection) {
                this.clearSelection();
            }
            this.pointers = this.pointers.filter(p => p.id !== id);
            return hadSelection && this.consumeSelectionClear();
        }
        return true;
    }

    onPointerMove(id: number, clientX: number, clientY: number): void {
        const idx = this.pointers.findIndex(p => p.id === id);
        if (idx < 0) return;
        this.pointers[idx] = {id, x: clientX, y: clientY};
        const rect = this.getCanvasRect();

        if (this.moveActive && this.pointers.length === 1) {
            const dx = clientX - rect.left - this.moveOffsetX;
            const dy = clientY - rect.top - this.moveOffsetY;
            const updated = this.stickers.map(p => {
                const b = this.moveBaselines.find(b => b.instanceId === p.instanceId);
                return b ? {...p, x: b.baseX + dx, y: b.baseY + dy} : p;
            });
            const next = this.cb.clampPlacements?.(updated, this.moveBaselines.map(b => b.instanceId)) ?? updated;
            this.stickers = next;
            this.cb.onPlacementsChanged(next);
            this.cb.onMovePointerChanged?.({clientX, clientY});
            this.didMove = true;
            return;
        }
    }

    nudgeActiveMove(dx: number, dy: number): void {
        if (!this.moveActive || this.pointers.length !== 1 || this.moveBaselines.length === 0) {
            return;
        }

        if (dx === 0 && dy === 0) {
            return;
        }

        const movingIds = this.moveBaselines.map(b => b.instanceId);
        const movingIdSet = new Set(movingIds);
        const updated = this.stickers.map(p => movingIdSet.has(p.instanceId)
            ? {...p, x: p.x + dx, y: p.y + dy}
            : p);
        const next = this.cb.clampPlacements?.(updated, movingIds) ?? updated;

        this.stickers = next;
        this.cb.onPlacementsChanged(next);
        this.didMove = true;
    }

    onPointerUp(id: number, clientX: number, clientY: number): void {
        this.pointers = this.pointers.filter(p => p.id !== id);
        if (this.pointers.length === 0) {
            if (this.didMove) this.cb.onPointerUpCommit?.(new Set(this.currentSelectionIds()));
            this.stopMove();
            this.didMove = false;
        }
        if (this.pointers.length === 1 && this.moveActive) {
            const r = this.pointers[0]; const rect = this.getCanvasRect();
            this.moveOffsetX = r.x - rect.left; this.moveOffsetY = r.y - rect.top;
            this.moveBaselines = this.selectedStickers().map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
        }
    }

    private hasSelection(): boolean { return this.sel?.hasSelection() ?? false; }
    private isSelected(id: string): boolean { return this.sel?.isSelected(id) ?? false; }

    private editableHitId(hitId: string | null): string | null {
        return hitId && this.canInteractWithSticker(hitId) ? hitId : null;
    }

    cancelInteraction(revertMove = false): void {
        if (revertMove && this.didMove && this.moveBaselines.length > 0) {
            const baselines = new Map(this.moveBaselines.map(baseline => [baseline.instanceId, baseline]));
            const reverted = this.stickers.map(placement => {
                const baseline = baselines.get(placement.instanceId);
                return baseline ? {...placement, x: baseline.baseX, y: baseline.baseY} : placement;
            });
            this.cb.onPlacementsChanged(reverted);
        }

        this.pointers = [];
        this.stopMove();
        this.didMove = false;
    }

    private clearSelection(): void {
        this.sel?.selectedInstanceId.set(null);
        this.sel?.multiSelection.set(new Set());
        this.cb.onSelectedChanged(null);
    }

    private currentSelectionIds(): string[] {
        return this.sel?.selectionIds() ?? [];
    }

    private selectedStickers(): StickerPlacement[] {
        return this.stickers.filter(p => this.isSelected(p.instanceId));
    }

    private resolveHit(hitId: string): string[] {
        const hit = this.stickers.find(p => p.instanceId === hitId);
        if (hit?.groupId) {
          return this.stickers.filter(p => p.groupId === hit.groupId).map(p => p.instanceId);
        }
        return [hitId];
    }

    private selectOnly(hitId: string): void {
        const ids = this.resolveHit(hitId);
        if (ids.length > 1) {
            this.cb.onSelectedChanged(null);
            this.sel?.multiSelection.set(new Set(ids));
            this.sel?.selectedInstanceId.set(null);
        } else {
            this.cb.onSelectedChanged(hitId);
        }
    }

    private startMove(localX: number, localY: number): void {
        this.moveBaselines = this.selectedStickers().map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
        if (this.moveBaselines.length === 0) {
            this.stopMove();
            return;
        }
        this.moveActive = true; this.moveOffsetX = localX; this.moveOffsetY = localY;
        this.cb.onMoveActiveChanged?.(true);
    }

    private stopMove(): void {
        if (!this.moveActive && this.moveBaselines.length === 0) return;
        this.moveActive = false;
        this.moveBaselines = [];
        this.cb.onMoveActiveChanged?.(false);
    }

}
