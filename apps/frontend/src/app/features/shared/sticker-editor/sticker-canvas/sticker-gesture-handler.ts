import type {StickerPlacement} from "@birthday/shared";
import {
    pointInPoly,
    pointInRotatedRect,
    isPointerOutsideRect,
    isPositionOutsideCanvas,
    distance,
    centroid,
    pinchDistance,
    pinchAngle,
    pinchMidpoint,
    applyPinchToBaseline,
    clampGroupScaleFactor,
} from '../geometry-helpers';

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
  relCx: number;
  relCy: number;
}

export interface MoveBaseline {
  instanceId: string;
  baseX: number;
  baseY: number;
}

export type GestureCallbacks = {
  onPlacementsChanged: (placements: StickerPlacement[]) => void;
  onLassoPathChanged: (path: { x: number; y: number }[] | null) => void;
  onLassoSelectionChanged: (ids: Set<string>) => void;
  onSelectedChanged: (instanceId: string | null) => void;
  onStickerDraggedOff?: (id: string, allIds: string[]) => void;
  onDragNearEdge?: (outsideCanvas: boolean) => void;
  onPointerUpCommit?: () => void;
  onMoveActiveChanged?: (active: boolean) => void;
  onDoubleTap?: (ids: string[]) => void;
  /** Returns the current selection's bounding box (canvas-local) + rotation, or null. */
  getSelectionBounds?: () => { box: { x: number; y: number; w: number; h: number }; rotation: number } | null;
};


// ── GestureHandler ───────────────────────────────────────────────────────────
export class StickerGestureHandler {
  private pointers: ActivePointer[] = [];


  // Freehand lasso state
  private lassoActive = false;
  private lassoPath: { x: number; y: number }[] = [];

  // Move state
  private moveActive = false;
  private moveOffsetX = 0;
  private moveOffsetY = 0;
  private moveBaselines: MoveBaseline[] = [];
  private didMove = false;

  // Pinch state
  private pinchBaseDistance = 0;
  private pinchBaseAngle = 0;
  private pinchBaselines: GroupBaseline[] = [];

  // Tap detection
  private tapStartX = 0;
  private tapStartY = 0;
  private tapMoved = false;

  // Double-tap detection
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  // Snapshot
  private stickers: StickerPlacement[] = [];
  private selectedInstanceId: string | null = null;
  private lassoSelection: Set<string> = new Set();

  constructor(
    private readonly getCanvasRect: () => DOMRect,
    private readonly hitTest: (clientX: number, clientY: number) => string | null,
    private readonly callbacks: GestureCallbacks,
  ) {
  }

  public syncState(
    stickers: StickerPlacement[],
    selectedInstanceId: string | null,
    lassoSelection: Set<string>,
  ): void {
    this.stickers = stickers;
    this.selectedInstanceId = selectedInstanceId;
    this.lassoSelection = lassoSelection;
  }


  // ── Pointer events ────────────────────────────────────────────────────────

  public onPointerDown(id: number, clientX: number, clientY: number): void {
    this.pointers.push({id, x: clientX, y: clientY});

    // Second finger → upgrade to pinch
    if (this.pointers.length === 2) {
      this.tapMoved = true;
      this.lassoActive = false;
      this.lassoPath = [];
      this.callbacks.onLassoPathChanged(null);
      this.moveActive = false;
      const ids = this.currentSelectionIds();
      if (ids.length > 0) this.initPinch(ids);
      return;
    }

    // First finger
    this.tapStartX = clientX;
    this.tapStartY = clientY;
    this.tapMoved = false;
    this.didMove = false;

    const rect = this.getCanvasRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const hitId = this.hitTest(clientX, clientY);

    if (this.hasSelection()) {
      // If the tap lands inside the selection's bounding box, drag it —
      // regardless of whether a sticker hitbox was actually hit.
      // This makes small stickers and groups much easier to move.
      const selBounds = this.callbacks.getSelectionBounds?.();
      const inBounds = selBounds
        ? pointInRotatedRect(localX, localY, selBounds.box, selBounds.rotation, 8)
        : false;

      if (inBounds) {
        // Inside the overlay → move current selection
        this.startMove(localX, localY);
      } else if (!hitId) {
        // Outside bounds, no hitbox hit → deselect + start lasso
        this.selectedInstanceId = null;
        this.lassoSelection = new Set();
        this.callbacks.onSelectedChanged(null);
        this.callbacks.onLassoSelectionChanged(new Set());
        this.lassoActive = true;
        this.lassoPath = [{x: localX, y: localY}];
        this.callbacks.onLassoPathChanged(this.lassoPath);
      } else if (!this.isSelected(hitId)) {
        // Hit a different sticker outside the selection → switch to it
        this.selectAndMove(hitId, localX, localY);
      } else {
        // Hit an already-selected sticker → move
        this.startMove(localX, localY);
      }
    } else if (hitId) {
      this.selectAndMove(hitId, localX, localY);
    } else {
      // Empty area → freehand lasso
      this.lassoActive = true;
      this.lassoPath = [{x: localX, y: localY}];
      this.callbacks.onLassoPathChanged(this.lassoPath);
    }
  }

  public onPointerMove(id: number, clientX: number, clientY: number): void {
    const idx = this.pointers.findIndex(p => p.id === id);
    if (idx < 0) return;
    this.pointers[idx] = {id, x: clientX, y: clientY};

    if (!this.tapMoved && Math.hypot(clientX - this.tapStartX, clientY - this.tapStartY) > 6)
      this.tapMoved = true;

    const rect = this.getCanvasRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    if (this.pointers.length === 2 && this.pinchBaselines.length > 0) {
      this.applyPinch();
      this.didMove = true;
      return;
    }

    if (this.moveActive && this.pointers.length === 1) {
      const dx = localX - this.moveOffsetX;
      const dy = localY - this.moveOffsetY;
      const updated = this.stickers.map(p => {
        const b = this.moveBaselines.find(b => b.instanceId === p.instanceId);
        return b ? {...p, x: b.baseX + dx, y: b.baseY + dy} : p;
      });
      this.callbacks.onPlacementsChanged(updated);
      this.didMove = true;
      if (this.callbacks.onDragNearEdge && this.hasSelection()) {
        this.callbacks.onDragNearEdge(
          this.isPointerOrCentroidNotOnCanvas(clientX, clientY, rect, updated),
        );
      }
      return;
    }

    if (this.lassoActive && this.pointers.length === 1) {
      const last = this.lassoPath[this.lassoPath.length - 1];
      if (!last || distance(localX, localY, last.x, last.y) > 2) {
        this.lassoPath.push({x: localX, y: localY});
        this.callbacks.onLassoPathChanged([...this.lassoPath]);
      }
    }
  }

  public onPointerUp(id: number, clientX: number, clientY: number): void {
    this.pointers = this.pointers.filter(p => p.id !== id);

    if (this.pointers.length === 0) {

      if (this.moveActive && this.tapMoved && this.callbacks.onStickerDraggedOff) {
        const rect = this.getCanvasRect();
        // Compute final placements with the current move offsets
        // (this.stickers may be stale — syncState hasn't run yet)
        const localX = clientX - rect.left;
        const localY = clientY - rect.top;
        const dx = localX - this.moveOffsetX;
        const dy = localY - this.moveOffsetY;
        const finalPlacements = this.stickers.map(p => {
          const b = this.moveBaselines.find(b => b.instanceId === p.instanceId);
          return b ? {...p, x: b.baseX + dx, y: b.baseY + dy} : p;
        });
        const outside = this.isPointerOrCentroidNotOnCanvas(clientX, clientY, rect, finalPlacements);
        if (outside && this.hasSelection()) {
          const ids = this.currentSelectionIds();
          this.selectedInstanceId = null;
          this.lassoSelection = new Set();
          this.moveActive = false;
          this.moveBaselines = [];
          this.callbacks.onMoveActiveChanged?.(false);
          this.callbacks.onSelectedChanged(null);
          this.callbacks.onLassoSelectionChanged(new Set());
          this.callbacks.onDragNearEdge?.(false);
          this.callbacks.onStickerDraggedOff(ids[0], ids);
          return;
        }
      }

      if (this.didMove) {
        this.callbacks.onPointerUpCommit?.();
      }
      this.finaliseLasso();
      this.moveActive = false;
      this.moveBaselines = [];
      this.pinchBaselines = [];
      this.didMove = false;
      this.callbacks.onMoveActiveChanged?.(false);
      this.callbacks.onDragNearEdge?.(false);

      // Double-tap detection
      if (!this.tapMoved && this.hasSelection()) {
        const now = Date.now();
        const dist = distance(clientX, clientY, this.lastTapX, this.lastTapY);
        if (now - this.lastTapTime < 350 && dist < 30) {
          this.callbacks.onDoubleTap?.(this.currentSelectionIds());
          this.lastTapTime = 0; // reset so triple-tap doesn't fire again
        } else {
          this.lastTapTime = now;
          this.lastTapX = clientX;
          this.lastTapY = clientY;
        }
      }
    }

    // Re-anchor when going 2 → 1 finger
    if (this.pointers.length === 1 && this.moveActive) {
      const remaining = this.pointers[0];
      const rect = this.getCanvasRect();
      this.moveOffsetX = remaining.x - rect.left;
      this.moveOffsetY = remaining.y - rect.top;
      this.moveBaselines = this.selectedStickers()
        .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
      this.pinchBaselines = [];
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private hasSelection(): boolean {
    return !!this.selectedInstanceId || this.lassoSelection.size > 0;
  }

  /**
   * Returns true if the pointer OR the centroid of the selected stickers
   * is outside the canvas bounds. This allows stickers to be deleted when
   * they're dragged to the edge even if the pointer is still barely inside.
   */
  private isPointerOrCentroidNotOnCanvas(clientX: number, clientY: number, rect: DOMRect, placements?: StickerPlacement[]): boolean {
    if (isPointerOutsideRect(clientX, clientY, rect)) return true;

    const source = placements ?? this.stickers;
    const sel = source.filter(p => this.isSelected(p.instanceId));
    if (sel.length === 0) return false;
    const c = centroid(sel);
    return isPositionOutsideCanvas(c.x, c.y, rect);
  }

  private isSelected(id: string): boolean {
    return this.selectedInstanceId === id || this.lassoSelection.has(id);
  }

  private currentSelectionIds(): string[] {
    if (this.lassoSelection.size > 0) return [...this.lassoSelection];
    return this.selectedInstanceId ? [this.selectedInstanceId] : [];
  }

  private selectedStickers(): StickerPlacement[] {
    return this.stickers.filter(p => this.isSelected(p.instanceId));
  }

  // Returns all instanceIds for the same group if hit sticker belongs to one,
  // otherwise just [hitId].
  private resolveHit(hitId: string): string[] {
    const hit = this.stickers.find(p => p.instanceId === hitId);
    if (hit?.groupId) {
      return this.stickers
        .filter(p => p.groupId === hit.groupId)
        .map(p => p.instanceId);
    }
    return [hitId];
  }

  private selectAndMove(hitId: string, localX: number, localY: number): void {
    const ids = this.resolveHit(hitId);
    if (ids.length > 1) {
      const groupSet = new Set(ids);
      this.lassoSelection = groupSet;
      this.selectedInstanceId = null;
      // Emit lasso first; do NOT call onSelectedChanged(null) afterwards —
      // that would trigger clearSelection() in the canvas and wipe the lasso set.
      this.callbacks.onLassoSelectionChanged(groupSet);
    } else {
      this.selectedInstanceId = hitId;
      this.lassoSelection = new Set();
      this.callbacks.onSelectedChanged(hitId);
      this.callbacks.onLassoSelectionChanged(new Set());
    }
    this.startMove(localX, localY);
  }

  private startMove(localX: number, localY: number): void {
    this.moveActive = true;
    this.moveOffsetX = localX;
    this.moveOffsetY = localY;
    this.moveBaselines = this.selectedStickers()
      .map(p => ({instanceId: p.instanceId, baseX: p.x, baseY: p.y}));
  }

  private finaliseLasso(): void {
    if (!this.lassoActive) return;
    this.lassoActive = false;
    this.callbacks.onLassoPathChanged(null);

    const path = this.lassoPath;
    this.lassoPath = [];

    if (path.length < 2) return;

    // Build closed polygon — if only 2 points, expand to a rect
    let poly: { x: number; y: number }[];
    if (path.length === 2) {
      const [a, b] = path;
      poly = [
        {x: a.x, y: a.y}, {x: b.x, y: a.y},
        {x: b.x, y: b.y}, {x: a.x, y: b.y},
        {x: a.x, y: a.y},
      ];
    } else {
      poly = [...path, path[0]];
    }

    const captured = this.stickers.filter(p => pointInPoly(p.x, p.y, poly));

    if (captured.length > 1) {
      // First clear single selection, then set the lasso group
      this.callbacks.onSelectedChanged(null);
      this.callbacks.onLassoSelectionChanged(new Set(captured.map(p => p.instanceId)));
    } else if (captured.length === 1) {
      this.callbacks.onLassoSelectionChanged(new Set());
      this.callbacks.onSelectedChanged(captured[0].instanceId);
    }
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
      .map(p => ({
        instanceId: p.instanceId,
        baseX: p.x,
        baseY: p.y,
        baseScale: p.scale,
        baseRotation: p.rotation,
        relCx: p.x - mid.x,
        relCy: p.y - mid.y,
      }));
  }

  private applyPinch(): void {
    if (this.pointers.length < 2 || !this.pinchBaselines.length) return;
    const [a, b] = this.pointers;
    const pp = {ax: a.x, ay: a.y, bx: b.x, by: b.y};
    const mid = pinchMidpoint(pp, this.getCanvasRect());
    const rawFactor = pinchDistance(pp) / this.pinchBaseDistance;
    const factor = clampGroupScaleFactor(rawFactor, this.pinchBaselines.map(bl => bl.baseScale));
    this.callbacks.onPlacementsChanged(
      this.stickers.map(p => {
        const base = this.pinchBaselines.find(b => b.instanceId === p.instanceId);
        if (!base) return p;
        const result = applyPinchToBaseline(base, this.pinchBaseAngle, factor, pp, mid);
        return {...p, ...result};
      }),
    );
  }
}
