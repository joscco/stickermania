import {
  Component, input, output, signal, computed, effect,
  ElementRef, ViewChild, AfterViewInit, OnDestroy,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {StickerPlacement, StickerDefinition} from '@birthday/shared';
import {hitTestOnCanvas} from './sticker-hit-test.util';
import {StickerGestureHandler} from './sticker-gesture-handler';
import {renderCanvasToDataUrl} from './sticker-canvas-renderer.util';
import {installCanvasInputListeners} from './sticker-canvas-input';
import {StickerContextMenuComponent, type ContextMenuAction} from '../sticker-context-menu/sticker-context-menu.component';
import type {BoundingBox} from '../sticker-types';
import {CANVAS_STICKER_PX} from '../sticker-types';
import * as ops from '../sticker-placement-ops';
import type {SelectionInfo} from '../selection-info';
import {HandleDragEvent, StickerSelectionOverlayComponent} from '../sticker-selection-overlay/sticker-selection-overlay.component';
import {AnimOnInitDirective, AnimPresenceDirective} from '../../animations/anim-on-init.directive';
import {SvgComponent} from '../../svg/svg.component';
import {getSpriteViewBox, preloadSprite} from '../sprite-url.util';
import {StickerItemComponent, type StickerAnimState} from './sticker-item/sticker-item.component';

@Component({
  selector: 'app-sticker-canvas',
  standalone: true,
  imports: [CommonModule, StickerSelectionOverlayComponent, StickerContextMenuComponent, StickerSelectionOverlayComponent, AnimOnInitDirective, AnimPresenceDirective, StickerItemComponent, SvgComponent],
  templateUrl: './sticker-canvas.component.html',
  host: {style: 'display: block; width: 100%; height: 100%;'},
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {

  // ── Inputs / Outputs ──────────────────────────────────────────────────────

  /** Central sticker height in px — used in the template via [style.height.px]. */
  readonly stickerSizePx = CANVAS_STICKER_PX;

  readonly stickers = input<StickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly maxStickers = input<number>(20);
  readonly canvasSize = input<number>(200);

  readonly placementsChanged = output<StickerPlacement[]>();
  readonly stickerRemoved = output<string>();

  @ViewChild('canvasArea') private canvasArea!: ElementRef<HTMLDivElement>;

  get canvasNativeElement(): HTMLDivElement | null {
    return this.canvasArea?.nativeElement ?? null;
  }

  // ── Selection state ───────────────────────────────────────────────────────

  readonly paletteDragInProgress = signal(false);
  readonly stickerWouldBeDeleted = signal(false);

  readonly selectedInstanceId = signal<string | null>(null);
  readonly lassoSelection = signal<Set<string>>(new Set());
  readonly stretchMode = signal<boolean>(false);
  readonly menuVisible = signal<boolean>(false);
  readonly isMoveActive = signal<boolean>(false);
  /** Accumulated overlay rotation for ad-hoc lasso multi-selections. Reset on new selection. */
  readonly multiSelectionRotation = signal<number>(0);

  readonly hasSelection = computed(() => !!this.selectedInstanceId() || this.lassoSelection().size > 0);
  readonly isMultiSelection = computed(() => this.lassoSelection().size > 1);
  readonly selectionIds = computed<string[]>(() => {
    const lassoSelection = this.lassoSelection();
    if (lassoSelection.size > 0) return [...lassoSelection];
    const id = this.selectedInstanceId();
    return id ? [id] : [];
  });

  // ── Visual / layout state ─────────────────────────────────────────────────

  readonly lassoPath = signal<{ x: number; y: number }[] | null>(null);
  readonly lassoPoints = computed(() => this.lassoPath()?.map(p => `${p.x},${p.y}`).join(' '));
  readonly canvasW = signal(400);
  readonly canvasH = signal(400);

  // ── Selection geometry ────────────────────────────────────────────────────

  readonly selectionInfo = computed<SelectionInfo | null>(() =>
    ops.computeSelectionInfo(this.stickers(), this.selectionIds(), id => this.getRenderedSize(id), this.multiSelectionRotation()),
  );

  readonly boundingBox = computed<BoundingBox | null>(() => this.selectionInfo()?.box ?? null);
  readonly menuAnchorX = computed(() => (this.selectionInfo()?.corners.tr.x ?? 0) + 14);
  readonly menuAnchorY = computed(() => (this.selectionInfo()?.corners.tr.y ?? 0) - 8);

  // ── Group helpers (for context menu) ─────────────────────────────────────

  readonly canGroup = computed(() => {
    const ids = this.selectionIds();
    if (ids.length < 2) {
      return false;
    }
    const all = this.stickers();
    const first = all.find(p => p.instanceId === ids[0]);
    return !first?.groupId || ids.some(id => all.find(p => p.instanceId === id)?.groupId !== first.groupId);
  });

  readonly canUngroup = computed(() =>
    this.stickers().some(p => this.selectionIds().includes(p.instanceId) && !!p.groupId),
  );

  readonly canDuplicate = computed(() =>
    this.selectionIds().length > 0 && (this.stickers().length + this.selectionIds().length) <= this.maxStickers(),
  );

  /** True when all selected stickers share the same groupId (persistent group, not lasso). */
  readonly isGroupSelection = computed(() => {
    const ids = this.selectionIds();
    if (ids.length < 2) {
      return false;
    }
    const all = this.stickers();
    const firstGid = (all.find(p => p.instanceId === ids[0]) as any)?.groupId as string | undefined;
    return !!firstGid && ids.every(id => (all.find(p => p.instanceId === id) as any)?.groupId === firstGid);
  });

  // ── Internals ─────────────────────────────────────────────────────────────

  private catalogMap = new Map<string, StickerDefinition>();
  private gesture!: StickerGestureHandler;
  private removeListeners: (() => void) | null = null;
  private removeOutsideListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  /**
   * Per-sticker animation states. Drives the [animState] input of each StickerItemComponent.
   * Only IDs with a non-idle state need an entry here.
   */
  private readonly animStates = signal<Map<string, StickerAnimState>>(new Map());

  getStickerAnimState(instanceId: string): StickerAnimState {
    return this.animStates().get(instanceId) ?? 'idle';
  }

  setAnimState(instanceId: string, state: StickerAnimState): void {
    this.animStates.update(m => new Map(m).set(instanceId, state));
  }

  clearAnimState(instanceId: string): void {
    this.animStates.update(m => {
      const n = new Map(m);
      n.delete(instanceId);
      return n;
    });
  }

  /** Schedule a removal: set state to 'removing'; StickerItemComponent emits `removed` when done. */
  scheduleRemoval(instanceIds: string[], done: () => void): void {
    if (!instanceIds.length) {
      done();
      return;
    }
    let pending = instanceIds.length;
    const onOne = () => {
      if (--pending === 0) done();
    };
    instanceIds.forEach(id => {
      this._pendingRemovals.set(id, onOne);
      this.setAnimState(id, 'removing');
    });
  }

  /** Called by StickerItemComponent (removed output) when its animation finishes. */
  onStickerAnimRemoved(instanceId: string): void {
    const cb = this._pendingRemovals.get(instanceId);
    this._pendingRemovals.delete(instanceId);
    this.clearAnimState(instanceId);
    cb?.();
  }

  private readonly _pendingRemovals = new Map<string, () => void>();


  constructor() {
    effect(() => {
      this.catalogMap.clear();
      for (const s of this.stickerCatalog()) this.catalogMap.set(s.id, s);
    });
    effect(() => {
      this.gesture?.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    // Ensure sprite is loaded so getSpriteViewBox works synchronously
    preloadSprite();

    this.gesture = new StickerGestureHandler(
      () => this.canvasArea.nativeElement.getBoundingClientRect(),
      (cx, cy) => hitTestOnCanvas(cx, cy, this.canvasArea.nativeElement.getBoundingClientRect(), this.stickers(), id => this.getRenderedSize(id), this.catalogMap),
      {
        onPlacementsChanged: p => this.emitPlacements(p),
        onLassoPathChanged: path => this.lassoPath.set(path),
        onLassoSelectionChanged: ids => {
          this.multiSelectionRotation.set(0);
          if (ids.size === 0) {
            this.lassoSelection.set(new Set());
          } else if (ids.size === 1) {
            this.selectedInstanceId.set([...ids][0]);
            this.lassoSelection.set(new Set());
          } else {
            this.lassoSelection.set(ids);
            this.selectedInstanceId.set(null);
          }
        },
        onSelectedChanged: id => {
          this.stretchMode.set(false);
          this.menuVisible.set(false);
          if (id) {
            // Switching to another sticker — no settle, instant switch
            this.clearSelection();
            this.selectedInstanceId.set(id);
          } else {
            this.clearSelection();
          }
        },
        onStickerDraggedOff: (_id, allIds) => {
          this.stickerWouldBeDeleted.set(false);
          const removed = new Set(allIds);
          this.scheduleRemoval(allIds, () => {
            const updated = this.stickers().filter(p => !removed.has(p.instanceId));
            this.emitPlacements(updated);
          });
        },
        onDragNearEdge: near => this.stickerWouldBeDeleted.set(near),
        onMoveActiveChanged: active => this.isMoveActive.set(active),
        onDoubleTap: ids => this.onDoubleTapFlip(ids),
        getSelectionBounds: () => this.selectionInfo(),
        onPointerUpCommit: (ids) => { ids.forEach(id => this.setAnimState(id, "settling")); }
      },
    );

    this.resizeObserver = new ResizeObserver(([e]) => {
      this.canvasW.set(e.contentRect.width);
      this.canvasH.set(e.contentRect.height);
    });
    this.resizeObserver.observe(this.canvasArea.nativeElement);

    this.removeListeners = installCanvasInputListeners(
      this.canvasArea.nativeElement,
      this.gesture,
      () => {
        this.menuVisible.set(false);
        this.gesture.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
      },
      () => this.paletteDragInProgress(),
    );

    // Clear selection when the user taps/clicks outside the canvas element.
    // Deferred by a microtask so that palette-initiated drags can update
    // selection state before this handler checks it.
    const onOutside = (ev: PointerEvent) => {
      if (!this.hasSelection()) return;
      if (this.canvasArea.nativeElement.contains(ev.target as Node)) return;
      if (this.paletteDragInProgress()) return;
      this.clearSelection();
    };

    document.addEventListener('pointerdown', onOutside, {capture: true});
    this.removeOutsideListener = () =>
      document.removeEventListener('pointerdown', onOutside, {capture: true});
  }

  ngOnDestroy(): void {
    this.removeListeners?.();
    this.removeOutsideListener?.();
    this.resizeObserver?.disconnect();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  toDataUrl(): Promise<string> {
    return renderCanvasToDataUrl(this.canvasArea.nativeElement, this.stickers(), id => this.getStickerUrl(id));
  }

  generateInstanceId(): string {
    return ops.generateInstanceId();
  }

  // ── Context menu ──────────────────────────────────────────────────────────

  async onMenuToggle(): Promise<void> {
    if (this.menuVisible()) {
      this.menuVisible.set(false);
    } else {
      this.menuVisible.set(true);
    }
  }

  onContextMenuAction(action: ContextMenuAction): void {
    this.menuVisible.set(false);
    const ids = this.selectionIds();
    switch (action) {
      case 'delete':
        this.removeSelected();
        break;
      case 'flipH':
        this.flipSelectionH(ids);
        break;
      case 'zForward':
        this.commitTransform(ops.swapZ(this.stickers(), ids, +1));
        break;
      case 'zBackward':
        this.commitTransform(ops.swapZ(this.stickers(), ids, -1));
        break;
      case 'zFront':
        this.commitTransform(ops.moveToEdge(this.stickers(), ids, 'front'));
        break;
      case 'zBack':
        this.commitTransform(ops.moveToEdge(this.stickers(), ids, 'back'));
        break;
      case 'group':
        this.commitGroup(ops.groupPlacements(this.stickers(), ids), ids);
        break;
      case 'ungroup':
        this.commitGroup(ops.ungroupPlacements(this.stickers(), ids), ids);
        break;
      case 'toggleStretch':
        this.stretchMode.set(!this.stretchMode());
        break;
      case 'duplicate':
        this.doDuplicate();
        break;
    }
  }

  // ── Selection overlay handles ─────────────────────────────────────────────

  onHandleDrag(ev: HandleDragEvent): void {
    const ids = this.selectionIds();
    if (!ids.length) return;

    if (ev.handle === 'rotate') {
      this.emitPlacements(ops.applyRotationDelta(this.stickers(), ids, ev.dx));
      if (this.isMultiSelection() && !this.isGroupSelection()) {
        this.multiSelectionRotation.update(r => r + ev.dx);
      }
    } else if (ev.handle === 'n' || ev.handle === 's' || ev.handle === 'e' || ev.handle === 'w') {
      if (ids.length !== 1) return;
      this.emitPlacements(ops.applyStretchHandle(this.stickers(), ids[0], ev.handle, ev.dx, ev.dy, id => this.getRenderedSize(id)));
    } else {
      // 'scale' — uniform scale
      const bb = this.boundingBox();
      this.emitPlacements(ops.applyCornerScale(this.stickers(), ids, ev.dx, ev.dy, bb ? {
        width: bb.w,
        height: bb.h,
      } : null, id => this.getRenderedSize(id)));
    }

    if (ev.done) {
      if (ids.length > 0) {
        ids.forEach(id => this.setAnimState(id, "settling"));
      }
    }
  }

  // ── Placement mutations ───────────────────────────────────────────────────

  removeSelected(): void {
    const group = this.lassoSelection();
    const ids = group.size > 0 ? [...group] : (this.selectedInstanceId() ? [this.selectedInstanceId()!] : []);
    if (!ids.length) return;
    this.clearSelection();
    const removedSet = new Set(ids);
    this.scheduleRemoval(ids, () => {
      const updated = this.stickers().filter(p => !removedSet.has(p.instanceId));
      if (group.size > 0) {
        this.emitPlacements(updated);
      } else this.stickerRemoved.emit(ids[0]);
    });
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  getStickerUrl(stickerId: string): string {
    return this.catalogMap.get(stickerId)?.imageUrl ?? '';
  }

  /** Returns the rendered width for a sticker based on viewBox and CANVAS_STICKER_PX height. */
  getStickerWidth(stickerId: string): number {
    const def = this.catalogMap.get(stickerId);
    if (def) {
      const vb = getSpriteViewBox(def.imageUrl);
      if (vb && vb.height > 0) {
        return Math.round(CANVAS_STICKER_PX * vb.width / vb.height);
      }
    }
    return CANVAS_STICKER_PX;
  }

  getHitboxSvgPoints(stickerId: string): string {
    const def = this.catalogMap.get(stickerId);
    if (!def?.hitboxPolygon || def.hitboxPolygon.length < 3) {
      return '';
    }
    return def.hitboxPolygon.map(p => `${p.x},${p.y}`).join(' ');
  }

  isSelected(instanceId: string): boolean {
    return this.selectedInstanceId() === instanceId || this.lassoSelection().has(instanceId);
  }

  isLassoSelected(instanceId: string): boolean {
    return this.lassoSelection().has(instanceId);
  }

  getStickerTransform(p: StickerPlacement): string {
    const pp = p as any;
    const sx = (p.flipX ? -1 : 1) * p.scale * (pp.scaleX ?? 1);
    const sy = (p.flipY ? -1 : 1) * p.scale * (pp.scaleY ?? 1);
    return `rotate(${p.rotation}deg) scale(${sx}, ${sy}) translate(-50%, -50%)`;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private emitPlacements(updated: StickerPlacement[]): void {
    this.placementsChanged.emit(updated);
  }

  private commitTransform(updated: StickerPlacement[]): void {
    this.emitPlacements(updated);
  }

  /** Flip selected stickers horizontally. */
  private flipSelectionH(ids: string[]): void {
    if (!ids.length) return;
    this.commitTransform(
      ids.length === 1
        ? ops.mirrorSingle(this.stickers(), ids[0], 'h')
        : ops.applyGroupTransform(this.stickers(), ids, 0, 1, 'h'),
    );
    ids.forEach(id => this.setAnimState(id, 'settling'));
  }

  /** Called by the gesture handler on double-tap. */
  private onDoubleTapFlip(ids: string[]): void {
    this.flipSelectionH(ids);
  }

  private commitGroup(updated: StickerPlacement[], ids: string[]): void {
    this.emitPlacements(updated);
    this.lassoSelection.set(new Set(ids));
    this.selectedInstanceId.set(null);
  }

  private doDuplicate(): void {
    if (!this.canDuplicate()) {
      return;
    }
    const {updated, newIds} = ops.duplicatePlacements(this.stickers(), this.selectionIds(), this.maxStickers());
    newIds.forEach(id => this.setAnimState(id, 'entering'));
    this.emitPlacements(updated);
    if (newIds.length === 1) {
      this.selectedInstanceId.set(newIds[0]);
      this.lassoSelection.set(new Set());
    } else {
      this.selectedInstanceId.set(null);
      this.lassoSelection.set(new Set(newIds));
    }
  }

  private clearSelection(): void {
    this.selectedInstanceId.set(null);
    this.stickerWouldBeDeleted.set(false);
    this.lassoSelection.set(new Set());
    this.multiSelectionRotation.set(0);
    this.menuVisible.set(false);
  }

  private getRenderedSize(instanceId: string): { width: number; height: number } {

    // Derive from viewBox aspect ratio: height = CANVAS_STICKER_PX, width proportional
    const placement = this.stickers().find(p => p.instanceId === instanceId);
    if (placement) {
      const def = this.catalogMap.get(placement.stickerId);
      if (def) {
        const vb = getSpriteViewBox(def.imageUrl);
        if (vb) {
          const h = CANVAS_STICKER_PX;
          const w = Math.round(h * vb.width / vb.height);
          return {width: w, height: h};
        }
      }
    }
    return {width: CANVAS_STICKER_PX, height: CANVAS_STICKER_PX};
  }
}

