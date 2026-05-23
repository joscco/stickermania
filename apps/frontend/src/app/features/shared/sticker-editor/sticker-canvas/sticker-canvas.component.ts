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

  readonly stickers = input<StickerPlacement[]>([]);
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
  readonly stickerWouldBeDeleted = computed(() => this.selectionState.dragNearEdge());
  readonly canvasW = signal(400);
  readonly canvasH = signal(400);
  readonly actionBarSpacing = 20;

  readonly stickerSizePx = computed(() => Math.round(this.canvasW() / 2));
  readonly committedCount = computed(() =>
    this.stickers().length - (this.paletteDragInProgress() ? 1 : 0));

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
      this.stickers(), this.selectionState.selectionIds(),
      id => this.getRenderedSize(id), this.selectionState.multiSelectionRotation()));

  readonly canGroup = computed(() => {
    const ids = this.selectionState.selectionIds();
    if (ids.length < 2) return false;
    const all = this.stickers();
    const first = all.find(p => p.instanceId === ids[0]);
    return !first?.groupId
      || ids.some(id => all.find(p => p.instanceId === id)?.groupId !== first.groupId);
  });

  readonly overlayRotation = computed(() => {
    const ids = this.selectionState.selectionIds();
    if (ids.length !== 1) {
      return 0;
    }
    return this.stickers().find(s => s.instanceId === ids[0])?.rotation ?? 0;
  });

  // Debug anchor
  readonly anchorStickerX = computed(() => {
    const ids = this.selectionState.selectionIds();
    if (ids.length !== 1) {
      return 0;
    }
    return this.stickers().find(s => s.instanceId === ids[0])?.x ?? 0;
  });
  readonly anchorStickerY = computed(() => {
    const ids = this.selectionState.selectionIds();
    if (ids.length !== 1) {
      return 0;
    }
    return this.stickers().find(s => s.instanceId === ids[0])?.y ?? 0;
  });

  readonly overlayBox = computed<BoundingBox | null>(() => {
    const ids = this.selectionState.selectionIds();
    if (ids.length !== 1) return null;
    const p = this.stickers().find(s => s.instanceId === ids[0]);
    if (!p) return null;
    return stickerTransformer.overlayBox(p, this.catalogMap.get(p.stickerId), this.stickerSizePx());
  });

  readonly canUngroup = computed(() =>
    this.stickers().some(p => this.selectionState.selectionIds().includes(p.instanceId) && !!p.groupId));

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
      this.gesture?.syncState(this.stickers(), this.selectionState);
    });
  }

  ngAfterViewInit(): void {
    preloadSprite();
    this.gesture = new StickerGestureHandler(
      () => this.canvasArea.nativeElement.getBoundingClientRect(),
      (cx, cy) => hitTestOnCanvas(
        cx, cy, this.canvasArea.nativeElement.getBoundingClientRect(),
        this.stickers(), id => this.getRenderedSize(id), this.catalogMap),
      this.buildGestureCallbacks(),
    );

    this.resizeObserver = new ResizeObserver(([e]) => {
      this.canvasW.set(e.contentRect.width);
      this.canvasH.set(e.contentRect.height);
    });
    this.resizeObserver.observe(this.canvasArea.nativeElement);

    this.removeListeners = installCanvasInputListeners(
      this.canvasArea.nativeElement, this.gesture,
      () => this.gesture.syncState(this.stickers(), this.selectionState),
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
            this.stickers().filter(p => !removed.has(p.instanceId)));
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
      this.canvasArea.nativeElement, this.stickers(),
      id => this.getStickerUrl(id), this.stickerSizePx());
  }

  generateInstanceId(): string {
    return ops.generateInstanceId();
  }

  // ── Action bar ─────────────────────────────────────────────────

  onOverlayHandle(ev: OverlayHandleEvent): void {
    const ids = this.selectionState.selectionIds();
    if (!ids.length) return;

    if (ev.type === 'rotate') {
      this.commit(ops.applyRotationDelta(this.stickers(), ids, ev.dx * 0.5));
    } else if (ev.type === 'n' || ev.type === 's' || ev.type === 'e' || ev.type === 'w') {
      if (ids.length === 1) {
        this.commit(ops.applyStretchHandle(this.stickers(), ids[0], ev.type as 'n' | 's' | 'e' | 'w', ev.dx, ev.dy, (id: string) => this.getRenderedSize(id)));
      }
    } else if (ev.type === 'scale') {
      const box = this.overlayBox();
      if (box && ids.length === 1 && box.w > 0 && box.h > 0) {
        const half = Math.max(box.w, box.h) / 2;
        const factor = (half + (ev.dx + ev.dy) / 2) / half;
        this.commit(ops.scaleSingle(this.stickers(), ids[0], factor));
      }
    }

    if (ev.done && ev.type !== 'rotate') ids.forEach(id => this.setAnimState(id, 'settling'));
  }

  private resetSelection(ids: string[]): void {
    if (!ids.length) return;
    this.commit(this.stickers().map(p =>
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
        this.commit(ops.swapZ(this.stickers(), ids, +1));
        break;
      case 'zBackward':
        this.commit(ops.swapZ(this.stickers(), ids, -1));
        break;
      case 'zFront':
        this.commit(ops.moveToEdge(this.stickers(), ids, 'front'));
        break;
      case 'zBack':
        this.commit(ops.moveToEdge(this.stickers(), ids, 'back'));
        break;
      case 'group':
        this.commitGroup(ops.groupPlacements(this.stickers(), ids), ids);
        break;
      case 'ungroup':
        this.commitGroup(ops.ungroupPlacements(this.stickers(), ids), ids);
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
      const updated = this.stickers().filter(p => !removed.has(p.instanceId));
      isLasso ? this.placementsChanged.emit(updated) : this.stickerRemoved.emit(ids[0]);
    });
  }

  private flipSelectionH(ids: string[]): void {
    if (!ids.length) return;
    this.commit(ids.length === 1
      ? ops.mirrorSingle(this.stickers(), ids[0], 'h')
      : ops.applyGroupTransform(this.stickers(), ids, 0, 1, 'h'));
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
      this.stickers(), this.selectionState.selectionIds(), this.maxStickers());
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
    return stickerTransformer.stickerTransform(p, this.catalogMap.get(p.stickerId), this.stickerSizePx());
  }

  getStickerAnchor(p: StickerPlacement): string {
    return stickerTransformer.stickerAnchor(p, this.catalogMap.get(p.stickerId), this.stickerSizePx());
  }

  stickerLeft(p: StickerPlacement): number {
    return stickerTransformer.stickerLeft(p, this.catalogMap.get(p.stickerId), this.stickerSizePx());
  }

  stickerTop(p: StickerPlacement): number {
    return stickerTransformer.stickerTop(p, this.catalogMap.get(p.stickerId), this.stickerSizePx());
  }

  private getRenderedSize(instanceId: string): { width: number; height: number } {
    const p = this.stickers().find(s => s.instanceId === instanceId);
    return stickerTransformer.stickerRenderedSize(p ?? {} as any, p ? this.catalogMap.get(p.stickerId) : undefined, this.stickerSizePx());
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
      const selectedSticker = this.stickers().filter(p => ids.includes(p.instanceId));
      if (!selectedSticker.length) {
        return 0;
      }
      return selectedSticker.reduce((s, p) => s + p[axis], 0) / selectedSticker.length;
    });
  }

}
