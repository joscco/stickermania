import {
  Component, input, output, signal, computed, effect,
  ElementRef, ViewChild, AfterViewInit, OnDestroy,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import gsap from 'gsap';
import type {StickerPlacement, StickerDefinition} from '@birthday/shared';
import {hitTestOnCanvas} from './sticker-hit-test.util';
import {StickerGestureHandler} from './sticker-gesture-handler';
import {renderCanvasToDataUrl} from './sticker-canvas-renderer.util';
import {installCanvasInputListeners} from './sticker-canvas-input';
import {animateStickerRemoval} from './sticker-removal-animation';
import {StickerContextMenuComponent, type ContextMenuAction} from '../sticker-shared/sticker-context-menu.component';
import {StickerUndoStack} from '../sticker-shared/sticker-undo-stack';
import type {BoundingBox} from '../sticker-shared/sticker-types';
import * as ops from '../sticker-shared/sticker-placement-ops';
import {HandleDragEvent, StickerSelectionOverlayComponent} from './sticker-selection-overlay/sticker-selection-overlay.component';

@Component({
  selector: 'app-sticker-canvas',
  standalone: true,
  imports: [CommonModule, StickerSelectionOverlayComponent, StickerContextMenuComponent, StickerSelectionOverlayComponent],
  templateUrl: './sticker-canvas.component.html',
  host: {style: 'display: block; width: 100%; height: 100%;'},
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {

  // ── Inputs / Outputs ──────────────────────────────────────────────────────

  readonly stickers = input<StickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly maxStickers = input<number>(20);
  readonly interactive = input<boolean>(false);

  readonly placementsChanged = output<StickerPlacement[]>();
  readonly stickerRemoved = output<string>();

  @ViewChild('canvasArea') private canvasArea!: ElementRef<HTMLDivElement>;
  @ViewChild('deleteZone') private deleteZone!: ElementRef<HTMLDivElement>;
  @ViewChild('contextMenu') private contextMenu?: StickerContextMenuComponent;

  get canvasNativeElement(): HTMLDivElement | null {
    return this.canvasArea?.nativeElement ?? null;
  }

  // ── Selection state ───────────────────────────────────────────────────────

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
    const s = this.lassoSelection();
    if (s.size > 0) return [...s];
    const id = this.selectedInstanceId();
    return id ? [id] : [];
  });

  // ── Undo ─────────────────────────────────────────────────────────────────

  readonly undo = new StickerUndoStack();

  // ── Visual / layout state ─────────────────────────────────────────────────

  readonly lassoPath = signal<{ x: number; y: number }[] | null>(null);
  readonly lassoPoints = computed(() => this.lassoPath()?.map(p => `${p.x},${p.y}`).join(' '));
  readonly dragNearEdge = signal<boolean>(false);
  readonly canvasW = signal(400);
  readonly canvasH = signal(400);

  // ── Selection geometry ────────────────────────────────────────────────────

  readonly selectionInfo = computed<{ box: BoundingBox; rotation: number } | null>(() =>
    ops.computeSelectionInfo(this.stickers(), this.selectionIds(), id => this.getRenderedSize(id), this.multiSelectionRotation()),
  );

  readonly boundingBox = computed<BoundingBox | null>(() => this.selectionInfo()?.box ?? null);
  readonly menuAnchorX = computed(() => (this.selectionInfo()?.box.x ?? 0) + (this.selectionInfo()?.box.w ?? 0) + 14);
  readonly menuAnchorY = computed(() => (this.boundingBox()?.y ?? 0) + (this.boundingBox()?.h ?? 0) + 6);

  // ── Group helpers (for context menu) ─────────────────────────────────────

  readonly canGroup = computed(() => {
    const ids = this.selectionIds();
    if (ids.length < 2) return false;
    const all = this.stickers();
    const first = all.find(p => p.instanceId === ids[0]);
    return !first?.groupId || ids.some(id => all.find(p => p.instanceId === id)?.groupId !== first.groupId);
  });

  readonly canUngroup = computed(() =>
    this.stickers().some(p => this.selectionIds().includes(p.instanceId) && !!p.groupId),
  );

  /** True when all selected stickers share the same groupId (persistent group, not lasso). */
  readonly isGroupSelection = computed(() => {
    const ids = this.selectionIds();
    if (ids.length < 2) return false;
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
  private readonly removingIds = new Set<string>();
  private readonly renderedSizeCache = new Map<string, { w: number; h: number }>();

  constructor() {
    effect(() => {
      this.catalogMap.clear();
      for (const s of this.stickerCatalog()) this.catalogMap.set(s.id, s);
    });
    effect(() => {
      this.gesture?.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
    });
    effect(() => {
      const el = this.deleteZone?.nativeElement;
      if (!el) return;
      const near = this.dragNearEdge();
      gsap.to(el, {
        opacity: near ? 1 : 0,
        duration: near ? 0.18 : 0.12,
        ease: near ? 'power2.out' : 'power2.in',
        overwrite: true
      });
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.gesture = new StickerGestureHandler(
      () => this.canvasArea.nativeElement.getBoundingClientRect(),
      (cx, cy) => hitTestOnCanvas(cx, cy, this.canvasArea.nativeElement.getBoundingClientRect(), this.stickers(), id => this.getRenderedSize(id), this.catalogMap),
      id => this.getRenderedSize(id),
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
          this.multiSelectionRotation.set(0);
          this.selectedInstanceId.set(id);
          if (id) this.lassoSelection.set(new Set());
          this.stretchMode.set(false);
          this.menuVisible.set(false);
        },
        onStickerDraggedOff: (_id, allIds) => {
          this.dragNearEdge.set(false);
          const removed = new Set(allIds);
          animateStickerRemoval(allIds, this.canvasArea.nativeElement, this.removingIds, () => {
            const updated = this.stickers().filter(p => !removed.has(p.instanceId));
            this.undo.push(updated);
            this.emitPlacements(updated);
          });
        },
        onDragNearEdge: near => this.dragNearEdge.set(near),
        onPointerUpCommit: () => this.undo.push(this.stickers()),
        onMoveActiveChanged: active => this.isMoveActive.set(active),
        getSelectionBounds: () => this.selectionInfo(),
      },
    );

    this.resizeObserver = new ResizeObserver(([e]) => {
      this.canvasW.set(e.contentRect.width);
      this.canvasH.set(e.contentRect.height);
    });
    this.resizeObserver.observe(this.canvasArea.nativeElement);

    if (this.interactive()) {
      this.removeListeners = installCanvasInputListeners(
        this.canvasArea.nativeElement,
        this.gesture,
        () => {
          this.menuVisible.set(false);
          this.syncGesture();
        },
      );

      // Clear selection when the user taps/clicks outside the canvas element
      const onOutside = (ev: PointerEvent) => {
        if (!this.hasSelection()) return;
        if (!this.canvasArea.nativeElement.contains(ev.target as Node)) {
          this.clearSelection();
        }
      };
      document.addEventListener('pointerdown', onOutside, {capture: true});
      this.removeOutsideListener = () =>
        document.removeEventListener('pointerdown', onOutside, {capture: true});
    }
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
      await this.contextMenu?.animateOut();
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
        this.commitTransform(ids.length === 1 ? ops.mirrorSingle(this.stickers(), ids[0], 'h') : ops.applyGroupTransform(this.stickers(), ids, 0, 1, 'h'));
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
      if (ev.done) this.undo.push(this.stickers());
      return;
    }
    if (ev.handle === 'n' || ev.handle === 's' || ev.handle === 'e' || ev.handle === 'w') {
      if (ids.length !== 1) return;
      this.emitPlacements(ops.applyStretchHandle(this.stickers(), ids[0], ev.handle, ev.dx, ev.dy, id => this.getRenderedSize(id)));
      if (ev.done) this.undo.push(this.stickers());
      return;
    }
    // 'se' — uniform scale
    const bb = this.boundingBox();
    this.emitPlacements(ops.applyCornerScale(this.stickers(), ids, ev.handle as 'nw' | 'ne' | 'se' | 'sw', ev.dx, ev.dy, bb ? {w: bb.w, h: bb.h} : null, id => this.getRenderedSize(id)));
    if (ev.done) this.undo.push(this.stickers());
  }

  // ── Placement mutations ───────────────────────────────────────────────────

  removeSelected(): void {
    const group = this.lassoSelection();
    const ids = group.size > 0 ? [...group] : (this.selectedInstanceId() ? [this.selectedInstanceId()!] : []);
    if (!ids.length) return;
    this.clearSelection();
    const removedSet = new Set(ids);
    animateStickerRemoval(ids, this.canvasArea.nativeElement, this.removingIds, () => {
      const updated = this.stickers().filter(p => !removedSet.has(p.instanceId));
      this.undo.push(updated);
      if (group.size > 0) this.emitPlacements(updated);
      else this.stickerRemoved.emit(ids[0]);
    });
  }

  undoAction(): void {
    const prev = this.undo.undo();
    if (prev) {
      this.clearSelection();
      this.emitPlacements(prev);
    }
  }

  redoAction(): void {
    const next = this.undo.redo();
    if (next) {
      this.clearSelection();
      this.emitPlacements(next);
    }
  }

  // ── Template helpers ──────────────────────────────────────────────────────

  getStickerUrl(stickerId: string): string {
    return this.catalogMap.get(stickerId)?.imageUrl ?? '';
  }

  getHitboxSvgPoints(stickerId: string): string {
    const def = this.catalogMap.get(stickerId);
    if (!def?.hitboxPolygon || def.hitboxPolygon.length < 3) return '';
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
    this.undo.push(updated);
  }

  private commitGroup(updated: StickerPlacement[], ids: string[]): void {
    this.emitPlacements(updated);
    this.undo.push(updated);
    this.lassoSelection.set(new Set(ids));
    this.selectedInstanceId.set(null);
  }

  private doDuplicate(): void {
    const {updated, newIds} = ops.duplicatePlacements(this.stickers(), this.selectionIds());
    this.emitPlacements(updated);
    this.undo.push(updated);
    if (newIds.length === 1) {
      this.selectedInstanceId.set(newIds[0]);
      this.lassoSelection.set(new Set());
    } else {
      this.lassoSelection.set(new Set(newIds));
      this.selectedInstanceId.set(null);
    }
  }

  private clearSelection(): void {
    this.selectedInstanceId.set(null);
    this.lassoSelection.set(new Set());
    this.multiSelectionRotation.set(0);
  }

  private getRenderedSize(instanceId: string): { w: number; h: number } {
    const wrapper = this.canvasArea?.nativeElement.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`);
    const img     = wrapper?.querySelector('img') as HTMLImageElement | null;
    if (img && img.offsetWidth > 0 && img.offsetHeight > 0) {
      return {w: img.offsetWidth, h: img.offsetHeight};
    }
    const cached = this.renderedSizeCache.get(instanceId);
    if (cached) return cached;
    return {w: 64, h: 64};
  }

  /** Store the rendered size for a new sticker before its <img> has loaded. */
  cacheRenderedSize(instanceId: string, w: number, h: number): void {
    this.renderedSizeCache.set(instanceId, {w, h});
  }

  private syncGesture(): void {
    this.gesture.syncState(this.stickers(), this.selectedInstanceId(), this.lassoSelection());
  }
}

