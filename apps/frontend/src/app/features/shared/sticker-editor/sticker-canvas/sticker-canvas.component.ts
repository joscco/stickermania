import {
  Component, input, output, signal, computed, effect,
  ElementRef, ViewChild, AfterViewInit, OnDestroy, inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {StickerPlacement, StickerDefinition} from '@birthday/shared';
import {hitTestOnCanvas} from './sticker-hit-test.util';
import {StickerGestureHandler} from './sticker-gesture-handler';
import type {GestureCallbacks} from './sticker-gesture-handler';
import {renderCanvasToDataUrl} from './sticker-canvas-renderer.util';
import {installCanvasInputListeners} from './sticker-canvas-input';
import type {BoundingBox, SelectionInfo} from '../types';
import * as ops from '../sticker-placement-ops';
import {AnimOnInitDirective, AnimPresenceDirective} from '../../animations/anim-on-init.directive';
import {SvgComponent} from '../../svg/svg.component';
import {preloadSprite} from '../sprite-url.util';
import {AudioService} from '../../../../core/audio.service';
import {StickerItemComponent, type StickerAnimState} from '../sticker-item/sticker-item.component';
import * as stickerTransformer from './sticker-transform.util';
import {OverlayHandleEvent, StickerOverlayComponent} from '../sticker-overlay/sticker-overlay.component';
import {ActionBarAction, StickerActionBarComponent} from '../sticker-action-bar/sticker-action-bar.component';
import {CanvasSelectionState} from './canvas-selection.state';

@Component({
  selector: 'app-sticker-canvas',
  standalone: true,
  imports: [
    CommonModule, StickerActionBarComponent,
    AnimOnInitDirective, AnimPresenceDirective,
    StickerItemComponent, SvgComponent, StickerOverlayComponent,
  ],
  templateUrl: './sticker-canvas.component.html',
  host: {class: 'block w-full h-full'},
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {

  readonly stickersOnCanvas = input<StickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly maxStickers = input<number>(20);

  readonly placementsChanged = output<StickerPlacement[]>();
  readonly stickerRemoved = output<string>();
  readonly clearAll = output<void>();

  @ViewChild('canvasArea') private canvasArea!: ElementRef<HTMLDivElement>;

  get canvasNativeElement(): HTMLDivElement | null {
    return this.canvasArea?.nativeElement ?? null;
  }

  // ── State ─────────────────────────────────────────────────────

  readonly selectionState = new CanvasSelectionState();
  readonly paletteDragInProgress = signal(false);
  private isRotating = signal(false);
  readonly stickerWouldBeDeleted = computed(() => this.selectionState.dragNearEdge());
  readonly canvasW = signal(400);
  readonly canvasH = signal(400);
  readonly actionBarSpacing = 20;

  readonly stickerSizePx = computed(() => Math.round(this.canvasW() / 2));
  readonly committedCount = computed(() =>
    this.stickersOnCanvas().length - (this.paletteDragInProgress() ? 1 : 0));

  readonly actionBarVisible = computed(() =>
    this.selectionState.hasSelection() && !this.selectionState.isMoveActive()
    && !this.selectionState.dragNearEdge() && !this.paletteDragInProgress());

  readonly overlayVisible = computed(() =>
    this.selectionState.hasSelection() && !this.selectionState.isMoveActive()
    && !this.selectionState.dragNearEdge() && !this.paletteDragInProgress()
    && !!this.overlayBox());

  readonly selectionCenterX = this.selectionCenter('x');
  readonly selectionCenterY = this.selectionCenter('y');

  readonly selectionInfo = computed<SelectionInfo | null>(() =>
    ops.computeSelectionInfo(
      this.stickersOnCanvas(), this.selectionState.selectionIds(),
      id => this.getRenderedSize(id), this.selectionState.multiSelectionRotation()));

  readonly canGroup = computed(() => {
    const ids = this.selectionState.selectionIds();
    if (ids.length < 2) return false;
    const all = this.stickersOnCanvas();
    const first = all.find(p => p.instanceId === ids[0]);
    return !first?.groupId
      || ids.some(id => all.find(p => p.instanceId === id)?.groupId !== first.groupId);
  });

  private accumulatedRotateDeg = signal(0);

  readonly overlayRotation = computed(() => {
    if (this.isRotating()) return this.accumulatedRotateDeg();
    const ids = this.selectionState.selectionIds();
    if (ids.length === 1) {
      return this.stickersOnCanvas().find(s => s.instanceId === ids[0])?.rotation ?? 0;
    }
    return this.selectionInfo()?.rotation ?? 0;
  });

  private freezeOverlay = signal(false);
  private frozenOverlayBox: BoundingBox | null = null;

  readonly overlayBox = computed<BoundingBox | null>(() => {
    if (this.freezeOverlay()) return this.frozenOverlayBox;
    const ids = this.selectionState.selectionIds();
    if (ids.length === 0) return null;
    const stickers = this.stickersOnCanvas().filter(s => ids.includes(s.instanceId));
    if (!stickers.length) return null;

    const boxes = stickers
      .map(s => stickerTransformer.overlayBox(s, this.catalogMap.get(s.stickerId), this.stickerSizePx()))
      .filter((b): b is BoundingBox => !!b);
    if (!boxes.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) {
      if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }
    const box = {x: minX, y: minY, w: maxX - minX, h: maxY - minY};
    this.frozenOverlayBox = box;
    return box;
  });

  readonly canUngroup = computed(() =>
    this.stickersOnCanvas().some(p => this.selectionState.selectionIds().includes(p.instanceId) && !!p.groupId));

  readonly canDuplicate = computed(() =>
    this.selectionState.selectionIds().length > 0
    && (this.committedCount() + this.selectionState.selectionIds().length) <= this.maxStickers());

  readonly lassoPath = signal<{ x: number; y: number }[] | null>(null);
  readonly lassoPoints = computed(() =>
    this.lassoPath()?.map(p => `${p.x},${p.y}`).join(' '));

  // ── Internals ─────────────────────────────────────────────────

  private readonly audio = inject(AudioService);
  private catalogMap = new Map<string, StickerDefinition>();
  private gesture!: StickerGestureHandler;
  private removeListeners: (() => void) | null = null;
  private removeOutsideListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private suppressDoubleTap = signal(false);
  private suppressTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastRotateX = 0;
  private _lastRotateY = 0;

  // ── Animation state ───────────────────────────────────────────

  private readonly animStates = signal<Map<string, StickerAnimState>>(new Map());
  private readonly pendingRemovals = new Map<string, () => void>();

  getStickerAnimState(id: string): StickerAnimState {
    return this.animStates().get(id) ?? 'idle';
  }

  setAnimState(id: string, state: StickerAnimState): void {
    this.animStates.update(m => new Map(m).set(id, state));
    if (state === 'settling') this.audio.playSettle();
  }

  clearAnimState(id: string): void {
    this.animStates.update(m => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  }

  scheduleRemoval(ids: string[], done: () => void): void {
    if (!ids.length) {
      done();
      return;
    }
    this.audio.playDelete();
    let pending = ids.length;
    const onOne = () => {
      if (--pending === 0) done();
    };
    ids.forEach(id => {
      this.pendingRemovals.set(id, onOne);
      this.setAnimState(id, 'removing');
    });
  }

  onStickerAnimRemoved(id: string): void {
    const cb = this.pendingRemovals.get(id);
    this.pendingRemovals.delete(id);
    this.clearAnimState(id);
    cb?.();
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  constructor() {
    effect(() => {
      this.catalogMap.clear();
      for (const s of this.stickerCatalog()) this.catalogMap.set(s.id, s);
    });
    effect(() => {
      this.gesture?.syncState(this.stickersOnCanvas(), this.selectionState);
    });
  }

  ngAfterViewInit(): void {
    preloadSprite();
    this.gesture = new StickerGestureHandler(
      () => this.canvasArea.nativeElement.getBoundingClientRect(),
      (cx, cy) => hitTestOnCanvas(
        cx, cy, this.canvasArea.nativeElement.getBoundingClientRect(),
        this.stickersOnCanvas(), id => this.getRenderedSize(id), this.catalogMap),
      this.buildGestureCallbacks(),
    );

    this.resizeObserver = new ResizeObserver(([e]) => {
      this.canvasW.set(e.contentRect.width);
      this.canvasH.set(e.contentRect.height);
    });
    this.resizeObserver.observe(this.canvasArea.nativeElement);

    this.removeListeners = installCanvasInputListeners(
      this.canvasArea.nativeElement, this.gesture,
      () => this.gesture.syncState(this.stickersOnCanvas(), this.selectionState),
      () => this.paletteDragInProgress(),
    );

    const onOutside = (ev: PointerEvent) => {
      if (!this.selectionState.hasSelection()) return;
      if (this.canvasArea.nativeElement.contains(ev.target as Node)) return;
      if (this.paletteDragInProgress()) return;
      this.selectionState.clear();
      this.selectionState.dragNearEdge.set(false);
    };
    document.addEventListener('pointerdown', onOutside, {capture: true});
    this.removeOutsideListener = () =>
      document.removeEventListener('pointerdown', onOutside, {capture: true});
  }

  ngOnDestroy(): void {
    this.removeListeners?.();
    this.removeOutsideListener?.();
    this.resizeObserver?.disconnect();
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
  }

  // ── Gesture handler callbacks ─────────────────────────────────

  private buildGestureCallbacks(): GestureCallbacks {
    return {
      onPlacementsChanged: p => this.placementsChanged.emit(p),
      onLassoPathChanged: path => this.lassoPath.set(path),
      onLassoSelectionChanged: ids => {
        this.selectionState.multiSelectionRotation.set(0);
        if (ids.size === 0) this.selectionState.lassoSelection.set(new Set());
        else if (ids.size === 1) {
          this.selectionState.selectedInstanceId.set([...ids][0]);
          this.selectionState.lassoSelection.set(new Set());
        } else {
          this.selectionState.lassoSelection.set(ids);
          this.selectionState.selectedInstanceId.set(null);
        }
      },
      onSelectedChanged: id => {
        this.selectionState.clear();
        if (id) this.selectionState.selectedInstanceId.set(id);
      },
      onStickerDraggedOff: (_id, allIds) => {
        const removed = new Set(allIds);
        this.scheduleRemoval(allIds, () => {
          this.selectionState.dragNearEdge.set(false);
          this.placementsChanged.emit(
            this.stickersOnCanvas().filter(p => !removed.has(p.instanceId)));
        });
      },
      onDragNearEdge: near => this.selectionState.dragNearEdge.set(near),
      onMoveActiveChanged: active => this.selectionState.isMoveActive.set(active),
      onDoubleTap: ids => {
        if (this.suppressDoubleTap()) return;
        this.flipSelectionH(ids);
      },
      onPointerUpCommit: ids => ids.forEach(id => this.setAnimState(id, 'settling')),
    };
  }

  // ── Public API ────────────────────────────────────────────────

  toDataUrl(): Promise<string> {
    return renderCanvasToDataUrl(
      this.canvasArea.nativeElement, this.stickersOnCanvas(),
      id => this.getStickerUrl(id), this.stickerSizePx());
  }

  generateInstanceId(): string {
    return ops.generateInstanceId();
  }

  // ── Action bar ─────────────────────────────────────────────────

  onOverlayHandle(ev: OverlayHandleEvent): void {
    const ids = this.selectionState.selectionIds();
    if (!ids.length) return;

    const type = ev.type as string;
    if (type === 'rotate') {
      if (ev.done) {
        this.isRotating.set(false);
        this.freezeOverlay.set(false);
        this.accumulatedRotateDeg.set(0);
        this._lastRotateX = 0;
        this._lastRotateY = 0;
      } else {
        if (!this.freezeOverlay()) this.freezeOverlay.set(true);
        this.isRotating.set(true);
        const box = this.overlayBox();
        if (box && ids.length) {
          const rect = this.canvasArea.nativeElement.getBoundingClientRect();
          const cx = rect.left + box.x + box.w / 2;
          const cy = rect.top + box.y + box.h / 2;
          if (this._lastRotateX === 0 && this._lastRotateY === 0) {
            this._lastRotateX = ev.clientX;
            this._lastRotateY = ev.clientY;
          } else {
            const pa = Math.atan2(this._lastRotateY - cy, this._lastRotateX - cx);
            const ca = Math.atan2(ev.clientY - cy, ev.clientX - cx);
            this._lastRotateX = ev.clientX;
            this._lastRotateY = ev.clientY;
            const deg = (ca - pa) * 180 / Math.PI;
            this.accumulatedRotateDeg.update(r => r + deg);
            this.commit(ops.applyRotationDelta(this.stickersOnCanvas(), ids, deg));
          }
        }
      }
    } else if (type === 'n' || type === 's' || type === 'e' || type === 'w') {
      if (ids.length === 1) {
        this.commit(ops.applyStretchHandle(this.stickersOnCanvas(), ids[0], type as 'n' | 's' | 'e' | 'w', ev.dx, ev.dy, (id: string) => this.getRenderedSize(id)));
      }
    } else if (type === 'scale') {
      const box = this.overlayBox();
      if (box && box.w > 0 && box.h > 0) {
        const half = Math.max(box.w, box.h) / 2;
        const delta = (ev.dx + ev.dy) / 2;
        if (ids.length === 1) {
          this.commit(ops.scaleSingle(this.stickersOnCanvas(), ids[0], (half + delta) / half));
        } else {
          this.commit(ops.applyGroupTransform(this.stickersOnCanvas(), ids, 0, (half + delta) / half, null));
        }
      }
    }

    if (ev.done && type !== 'rotate') ids.forEach(id => this.setAnimState(id, 'settling'));
  }

  private resetSelection(ids: string[]): void {
    if (!ids.length) return;
    this.commit(this.stickersOnCanvas().map(p =>
      ids.includes(p.instanceId)
        ? {...p, scale: 1, rotation: 0, scaleX: undefined, scaleY: undefined, flipX: false, flipY: false}
        : p));
    ids.forEach(id => this.setAnimState(id, 'settling'));
  }

  onActionBarAction(action: ActionBarAction): void {
    this.suppressDoubleTap.set(true);
    if (this.suppressTimer) clearTimeout(this.suppressTimer);
    this.suppressTimer = setTimeout(() => {
      this.suppressDoubleTap.set(false);
      this.suppressTimer = null;
    }, 400);
    const ids = this.selectionState.selectionIds();
    this.handleAction(action, ids);
  }

  private handleAction(action: ActionBarAction, ids: string[]): void {
    switch (action) {
      case 'delete':
        this.removeSelected();
        break;
      case 'flipH':
        this.flipSelectionH(ids);
        break;
      case 'zForward':
        this.commit(ops.swapZ(this.stickersOnCanvas(), ids, +1));
        break;
      case 'zBackward':
        this.commit(ops.swapZ(this.stickersOnCanvas(), ids, -1));
        break;
      case 'zFront':
        this.commit(ops.moveToEdge(this.stickersOnCanvas(), ids, 'front'));
        break;
      case 'zBack':
        this.commit(ops.moveToEdge(this.stickersOnCanvas(), ids, 'back'));
        break;
      case 'group':
        this.commitGroup(ops.groupPlacements(this.stickersOnCanvas(), ids), ids);
        break;
      case 'ungroup':
        this.commitGroup(ops.ungroupPlacements(this.stickersOnCanvas(), ids), ids);
        break;
      case 'duplicate':
        this.doDuplicate();
        break;
      case 'reset':
        this.resetSelection(ids);
        break;
    }
  }

  private commit(updated: StickerPlacement[]): void {
    this.placementsChanged.emit(updated);
  }

  // ── Placement mutations ───────────────────────────────────────

  removeSelected(): void {
    const ids = this.selectionState.selectionIds();
    if (!ids.length) return;
    const isLasso = this.selectionState.isMultiSelection();
    this.selectionState.clear();
    const removed = new Set(ids);
    this.scheduleRemoval(ids, () => {
      const updated = this.stickersOnCanvas().filter(p => !removed.has(p.instanceId));
      isLasso ? this.placementsChanged.emit(updated) : this.stickerRemoved.emit(ids[0]);
    });
  }

  private flipSelectionH(ids: string[]): void {
    if (!ids.length) return;
    this.commit(ids.length === 1
      ? ops.mirrorSingle(this.stickersOnCanvas(), ids[0], 'h')
      : ops.applyGroupTransform(this.stickersOnCanvas(), ids, 0, 1, 'h'));
    ids.forEach(id => this.setAnimState(id, 'settling'));
  }

  private commitGroup(updated: StickerPlacement[], ids: string[]): void {
    this.commit(updated);
    this.selectionState.lassoSelection.set(new Set(ids));
    this.selectionState.selectedInstanceId.set(null);
  }

  private doDuplicate(): void {
    if (!this.canDuplicate()) return;
    const {updated, newIds} = ops.duplicatePlacements(
      this.stickersOnCanvas(), this.selectionState.selectionIds(), this.maxStickers());
    newIds.forEach(id => this.setAnimState(id, 'entering'));
    this.commit(updated);
    if (newIds.length === 1) {
      this.selectionState.selectedInstanceId.set(newIds[0]);
    } else {
      this.selectionState.selectedInstanceId.set(null);
      this.selectionState.lassoSelection.set(new Set(newIds));
    }
  }

  // ── Template helpers ──────────────────────────────────────────

  getStickerUrl(stickerId: string): string {
    return this.catalogMap.get(stickerId)?.imageUrl ?? '';
  }

  getStickerWidth(stickerId: string): number {
    return stickerTransformer.stickerRenderedSize({} as any, this.catalogMap.get(stickerId), this.stickerSizePx()).width;
  }

  getHitboxSvgPoints(stickerId: string): string {
    const hp = this.catalogMap.get(stickerId)?.hitboxPolygon;
    return hp && hp.length >= 3 ? hp.map(p => `${p.x},${p.y}`).join(' ') : '';
  }

  getStickerTransform(p: StickerPlacement): string {
    return stickerTransformer.stickerTransform(p);
  }

  private stickerSizeFor(p: StickerPlacement) {
    return this.getRenderedSize(p.instanceId);
  }

  getStickerAnchor(p: StickerPlacement): string {
    const def = this.catalogMap.get(p.stickerId);
    const ob = def?.overlayBounds;
    if (!ob) {
      return '50% 50%';
    }
    const s = this.stickerSizeFor(p);
    return `${(ob.x * s.width)}px ${(ob.y * s.height)}px`;
  }

  stickerLeft(p: StickerPlacement): number {
    const def = this.catalogMap.get(p.stickerId);
    const ob = def?.overlayBounds;
    if (!ob) {
      return p.x - 0.5 * this.stickerSizeFor(p).width;
    }
    return p.x - ob.x * this.stickerSizeFor(p).width;
  }

  stickerTop(p: StickerPlacement): number {
    const def = this.catalogMap.get(p.stickerId);
    const ob = def?.overlayBounds;
    if (!ob) {
      return p.y - 0.5 * this.stickerSizeFor(p).height;
    }
    return p.y - ob.y * this.stickerSizeFor(p).height;
  }

  private getRenderedSize(instanceId: string): { width: number; height: number } {
    const placement = this.stickersOnCanvas().find(sticker => sticker.instanceId === instanceId);
    return stickerTransformer.stickerRenderedSize(placement ?? {} as any, placement ? this.catalogMap.get(placement.stickerId) : undefined, this.stickerSizePx());
  }

  isSelected(id: string): boolean {
    return this.selectionState.isSelected(id);
  }

  isLassoSelected(id: string): boolean {
    return this.selectionState.isLassoSelected(id);
  }

  // ── Private helpers ───────────────────────────────────────────

  private selectionCenter(axis: 'x' | 'y') {
    return computed(() => {
      const ids = this.selectionState.selectionIds();
      if (!ids.length) {
        return 0;
      }
      const selectedSticker = this.stickersOnCanvas().filter(p => ids.includes(p.instanceId));
      if (!selectedSticker.length) {
        return 0;
      }
      return selectedSticker.reduce((s, p) => s + p[axis], 0) / selectedSticker.length;
    });
  }

}
