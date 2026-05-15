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
import {StickerContextMenuComponent, type ContextMenuAction} from '../sticker-context-menu/sticker-context-menu.component';
import type {BoundingBox, SelectionInfo} from '../types';
import * as ops from '../sticker-placement-ops';
import {HandleDragEvent, StickerSelectionOverlayComponent} from '../sticker-selection-overlay/sticker-selection-overlay.component';
import {AnimOnInitDirective, AnimPresenceDirective} from '../../animations/anim-on-init.directive';
import {SvgComponent} from '../../svg/svg.component';
import {getSpriteViewBox, preloadSprite} from '../sprite-url.util';
import {AudioService} from '../../../../core/audio.service';
import {StickerItemComponent, type StickerAnimState} from './sticker-item/sticker-item.component';

@Component({
  selector: 'app-sticker-canvas',
  standalone: true,
  imports: [
    CommonModule,
    StickerSelectionOverlayComponent,
    StickerContextMenuComponent,
    AnimOnInitDirective,
    AnimPresenceDirective,
    StickerItemComponent,
    SvgComponent,
  ],
  templateUrl: './sticker-canvas.component.html',
  host: {style: 'display: block; width: 100%; height: 100%;'},
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {

  // ── Inputs / Outputs ──────────────────────────────────────────

  readonly stickerSizePx = computed(() => Math.round(this.canvasW() / 2));

  readonly stickers = input<StickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly maxStickers = input<number>(20);

  readonly placementsChanged = output<StickerPlacement[]>();
  readonly stickerRemoved = output<string>();
  readonly clearAll = output<void>();

  readonly committedCount = computed(() =>
    this.stickers().length - (this.paletteDragInProgress() ? 1 : 0));
  readonly canAddMore = computed(() => this.committedCount() < this.maxStickers());

  @ViewChild('canvasArea') private canvasArea!: ElementRef<HTMLDivElement>;

  get canvasNativeElement(): HTMLDivElement | null {
    return this.canvasArea?.nativeElement ?? null;
  }

  // ── Selection state ───────────────────────────────────────────

  readonly selectedInstanceId = signal<string | null>(null);
  readonly lassoSelection = signal<Set<string>>(new Set());
  readonly stretchMode = signal<boolean>(false);
  readonly menuVisible = signal<boolean>(false);
  readonly isMoveActive = signal<boolean>(false);
  readonly multiSelectionRotation = signal<number>(0);

  readonly hasSelection = computed(() =>
    !!this.selectedInstanceId() || this.lassoSelection().size > 0);
  readonly isMultiSelection = computed(() =>
    this.lassoSelection().size > 1);
  readonly selectionIds = computed<string[]>(() => {
    const ls = this.lassoSelection();
    if (ls.size > 0) return [...ls];
    const id = this.selectedInstanceId();
    return id ? [id] : [];
  });

  // ── Drag / visual flags ───────────────────────────────────────

  readonly paletteDragInProgress = signal(false);
  readonly stickerWouldBeDeleted = signal(false);

  // ── Layout / sizing ───────────────────────────────────────────

  readonly canvasW = signal(400);
  readonly canvasH = signal(400);

  // ── Selection geometry (derived) ──────────────────────────────

  readonly selectionInfo = computed<SelectionInfo | null>(() =>
    ops.computeSelectionInfo(
      this.stickers(),
      this.selectionIds(),
      id => this.getRenderedSize(id),
      this.multiSelectionRotation(),
    ));

  readonly boundingBox = computed<BoundingBox | null>(() =>
    this.selectionInfo()?.box ?? null);

  readonly overlayVisible = computed(() =>
    this.hasSelection() && !this.stickerWouldBeDeleted() && !this.paletteDragInProgress());

  readonly menuAnchorX = computed(() =>
    (this.selectionInfo()?.corners.tr.x ?? 0) + 14);

  readonly menuAnchorY = computed(() =>
    (this.selectionInfo()?.corners.tr.y ?? 0) - 8);

  // ── Lasso path (svg overlay) ──────────────────────────────────

  readonly lassoPath = signal<{ x: number; y: number }[] | null>(null);
  readonly lassoPoints = computed(() =>
    this.lassoPath()?.map(p => `${p.x},${p.y}`).join(' '));

  // ── Context-menu capability flags ─────────────────────────────

  readonly canGroup = computed(() => {
    const ids = this.selectionIds();
    if (ids.length < 2) return false;
    const all = this.stickers();
    const first = all.find(p => p.instanceId === ids[0]);
    return !first?.groupId
      || ids.some(id => all.find(p => p.instanceId === id)?.groupId !== first.groupId);
  });

  readonly canUngroup = computed(() =>
    this.stickers().some(p => this.selectionIds().includes(p.instanceId) && !!p.groupId));

  readonly canDuplicate = computed(() =>
    this.selectionIds().length > 0
    && (this.committedCount() + this.selectionIds().length) <= this.maxStickers());

  readonly isGroupSelection = computed(() => {
    const ids = this.selectionIds();
    if (ids.length < 2) return false;
    const all = this.stickers();
    const gid = all.find(p => p.instanceId === ids[0])?.groupId;
    return !!gid && ids.every(id =>
      all.find(p => p.instanceId === id)?.groupId === gid);
  });

  // ── Internals ─────────────────────────────────────────────────

  private readonly audio = inject(AudioService);
  private catalogMap = new Map<string, StickerDefinition>();
  private gesture!: StickerGestureHandler;
  private removeListeners: (() => void) | null = null;
  private removeOutsideListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // ── Animation state ───────────────────────────────────────────

  private readonly animStates = signal<Map<string, StickerAnimState>>(new Map());
  private readonly pendingRemovals = new Map<string, () => void>();

  getStickerAnimState(id: string): StickerAnimState {
    return this.animStates().get(id) ?? 'idle';
  }

  setAnimState(id: string, state: StickerAnimState): void {
    this.animStates.update(m => new Map(m).set(id, state));
    if (state === 'settling') {
      this.audio.playSettle();
    }
  }

  clearAnimState(id: string): void {
    this.animStates.update(m => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
  }

  scheduleRemoval(ids: string[], done: () => void): void {
    if (!ids.length) { done(); return; }
    this.audio.playDelete();
    let pending = ids.length;
    const onOne = () => { if (--pending === 0) done(); };
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

  // ── Constructor effects ───────────────────────────────────────

  constructor() {
    effect(() => {
      this.catalogMap.clear();
      for (const s of this.stickerCatalog()) this.catalogMap.set(s.id, s);
    });
    effect(() => {
      this.gesture?.syncState(
        this.stickers(), this.selectedInstanceId(), this.lassoSelection());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  ngAfterViewInit(): void {
    preloadSprite();
    this.gesture = new StickerGestureHandler(
      () => this.canvasArea.nativeElement.getBoundingClientRect(),
      (cx, cy) => hitTestOnCanvas(
        cx, cy,
        this.canvasArea.nativeElement.getBoundingClientRect(),
        this.stickers(),
        id => this.getRenderedSize(id),
        this.catalogMap,
      ),
      this.buildGestureCallbacks(),
    );

    // Track canvas pixel dimensions (used by empty-state hint & context menu).
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
        this.gesture.syncState(
          this.stickers(), this.selectedInstanceId(), this.lassoSelection());
      },
      () => this.paletteDragInProgress(),
    );

    // Click outside canvas → clear selection.
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

  // ── Gesture handler callbacks ─────────────────────────────────

  private buildGestureCallbacks(): GestureCallbacks {
    return {
      onPlacementsChanged: p => this.placementsChanged.emit(p),

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
          this.clearSelection();
          this.selectedInstanceId.set(id);
        } else {
          this.clearSelection();
        }
      },

      onStickerDraggedOff: (_id, allIds) => {
        this.stickerWouldBeDeleted.set(false);
        const removed = new Set(allIds);
        this.scheduleRemoval(allIds, () =>
          this.placementsChanged.emit(
            this.stickers().filter(p => !removed.has(p.instanceId))));
      },

      onDragNearEdge: near => this.stickerWouldBeDeleted.set(near),
      onMoveActiveChanged: active => this.isMoveActive.set(active),
      onDoubleTap: ids => this.flipSelectionH(ids),
      getSelectionBounds: () => this.selectionInfo(),
      onPointerUpCommit: ids =>
        ids.forEach(id => this.setAnimState(id, 'settling')),
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

  // ── Context menu ──────────────────────────────────────────────

  onMenuToggle(): void {
    this.menuVisible.set(!this.menuVisible());
  }

  onContextMenuAction(action: ContextMenuAction): void {
    this.menuVisible.set(false);
    const ids = this.selectionIds();
    (this.contextMenuHandlers[action] ?? (() => {}))(ids);
  }

  private readonly contextMenuHandlers: Record<ContextMenuAction, (ids: string[]) => void> = {
    'delete':       () => { this.removeSelected(); },
    'flipH':        ids => { this.flipSelectionH(ids); },
    'zForward':     ids => { this.placementsChanged.emit(ops.swapZ(this.stickers(), ids, +1)); },
    'zBackward':    ids => { this.placementsChanged.emit(ops.swapZ(this.stickers(), ids, -1)); },
    'zFront':       ids => { this.placementsChanged.emit(ops.moveToEdge(this.stickers(), ids, 'front')); },
    'zBack':        ids => { this.placementsChanged.emit(ops.moveToEdge(this.stickers(), ids, 'back')); },
    'group':        ids => { this.commitGroup(ops.groupPlacements(this.stickers(), ids), ids); },
    'ungroup':      ids => { this.commitGroup(ops.ungroupPlacements(this.stickers(), ids), ids); },
    'toggleStretch': () => { this.stretchMode.set(!this.stretchMode()); },
    'duplicate':    () => { this.doDuplicate(); },
  };

  // ── Selection overlay handles ─────────────────────────────────

  onHandleDrag(ev: HandleDragEvent): void {
    const ids = this.selectionIds();
    if (!ids.length) return;

    if (ev.handle === 'rotate') {
      this.placementsChanged.emit(ops.applyRotationDelta(this.stickers(), ids, ev.dx));
      if (this.isMultiSelection() && !this.isGroupSelection()) {
        this.multiSelectionRotation.update(r => r + ev.dx);
      }
    } else if (ev.handle === 'n' || ev.handle === 's' || ev.handle === 'e' || ev.handle === 'w') {
      if (ids.length === 1) {
        this.placementsChanged.emit(
          ops.applyStretchHandle(this.stickers(), ids[0], ev.handle,
            ev.dx, ev.dy, id => this.getRenderedSize(id)));
      }
    } else {
      const bb = this.boundingBox();
      this.placementsChanged.emit(ops.applyCornerScale(
        this.stickers(), ids, ev.dx, ev.dy,
        bb ? {width: bb.w, height: bb.h} : null,
        id => this.getRenderedSize(id)));
    }

    if (ev.done && ids.length > 0) {
      ids.forEach(id => this.setAnimState(id, 'settling'));
    }
  }

  // ── Placement mutations ───────────────────────────────────────

  removeSelected(): void {
    const ls = this.lassoSelection();
    const ids = ls.size > 0
      ? [...ls]
      : (this.selectedInstanceId() ? [this.selectedInstanceId()!] : []);
    if (!ids.length) return;
    this.clearSelection();
    const removed = new Set(ids);
    this.scheduleRemoval(ids, () => {
      const updated = this.stickers().filter(p => !removed.has(p.instanceId));
      if (ls.size > 0) {
        this.placementsChanged.emit(updated);
      } else {
        this.stickerRemoved.emit(ids[0]);
      }
    });
  }

  // ── Template helpers ──────────────────────────────────────────

  getStickerUrl(stickerId: string): string {
    return this.catalogMap.get(stickerId)?.imageUrl ?? '';
  }

  getStickerWidth(stickerId: string): number {
    const def = this.catalogMap.get(stickerId);
    if (!def) return this.stickerSizePx();
    const vb = getSpriteViewBox(def.imageUrl);
    return vb && vb.height > 0
      ? Math.round(this.stickerSizePx() * vb.width / vb.height)
      : this.stickerSizePx();
  }

  getHitboxSvgPoints(stickerId: string): string {
    const hp = this.catalogMap.get(stickerId)?.hitboxPolygon;
    return hp && hp.length >= 3 ? hp.map(p => `${p.x},${p.y}`).join(' ') : '';
  }

  isSelected(id: string): boolean {
    return this.selectedInstanceId() === id || this.lassoSelection().has(id);
  }

  isLassoSelected(id: string): boolean {
    return this.lassoSelection().has(id);
  }

  getStickerTransform(p: StickerPlacement): string {
    const sx = (p.flipX ? -1 : 1) * p.scale * ((p as any).scaleX ?? 1);
    const sy = (p.flipY ? -1 : 1) * p.scale * ((p as any).scaleY ?? 1);
    return `rotate(${p.rotation}deg) scale(${sx}, ${sy}) translate(-50%, -50%)`;
  }

  // ── Private helpers ───────────────────────────────────────────

  private flipSelectionH(ids: string[]): void {
    if (!ids.length) return;
    this.placementsChanged.emit(
      ids.length === 1
        ? ops.mirrorSingle(this.stickers(), ids[0], 'h')
        : ops.applyGroupTransform(this.stickers(), ids, 0, 1, 'h'));
    ids.forEach(id => this.setAnimState(id, 'settling'));
  }

  private commitGroup(updated: StickerPlacement[], ids: string[]): void {
    this.placementsChanged.emit(updated);
    this.lassoSelection.set(new Set(ids));
    this.selectedInstanceId.set(null);
  }

  private doDuplicate(): void {
    if (!this.canDuplicate()) return;
    const {updated, newIds} = ops.duplicatePlacements(
      this.stickers(), this.selectionIds(), this.maxStickers());
    newIds.forEach(id => this.setAnimState(id, 'entering'));
    this.placementsChanged.emit(updated);
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
    this.lassoSelection.set(new Set());
    this.stickerWouldBeDeleted.set(false);
    this.multiSelectionRotation.set(0);
    this.menuVisible.set(false);
  }

  private getRenderedSize(instanceId: string): { width: number; height: number } {
    const placement = this.stickers().find(p => p.instanceId === instanceId);
    if (placement) {
      const def = this.catalogMap.get(placement.stickerId);
      if (def) {
        const vb = getSpriteViewBox(def.imageUrl);
        if (vb && vb.height > 0) {
          return {
            width: Math.round(this.stickerSizePx() * vb.width / vb.height),
            height: this.stickerSizePx(),
          };
        }
      }
    }
    return {width: this.stickerSizePx(), height: this.stickerSizePx()};
  }
}
