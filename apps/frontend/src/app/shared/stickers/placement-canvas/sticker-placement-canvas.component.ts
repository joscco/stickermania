import {AfterViewChecked, AfterViewInit, Component, computed, effect, ElementRef, input, OnDestroy, output, signal, ViewChild,} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {StickerDefinition, StickerPlacement} from '@birthday/shared';
import {STICKERMANIA_CONFIG} from '@birthday/shared/stickermaniaConfig';
import {hitTestOnCanvas, StickerHitGeometry} from './interaction/sticker-hit-test.util';
import type {GestureCallbacks} from './interaction/sticker-gesture-handler';
import {StickerGestureHandler} from './interaction/sticker-gesture-handler';
import {StickerCanvasDomBindings} from "./interaction/sticker-canvas-dom-bindings";
import {CanvasSelectionState} from './state/canvas-selection.state';
import {StickerCanvasOverlayInteractionState} from "./state/sticker-canvas-overlay-interaction.state";
import {StickerCanvasAnimationController} from "./state/sticker-canvas-animation.controller";
import {actionBarViewportBoundsForCanvas, viewportBoundsEqual,} from "./interaction/sticker-action-bar-viewport.util";
import * as renderModel from "./rendering/sticker-canvas-render-model";
import {normalizedBoundsFromOverlayBounds} from './rendering/sticker-transform.util';
import {StickerAlphaMaskPreloader} from "./rendering/sticker-alpha-mask-preloader";
import {StickerCanvasSelectionPresentation} from "./rendering/sticker-canvas-selection.presentation";
import {StickerCanvasEditController} from "./commands/sticker-canvas-edit.controller";
import {ActionBarAction, ActionBarViewportBounds, StickerActionBarComponent} from './sticker-action-bar/sticker-action-bar.component';
import {AnimOnInitDirective} from '../../ui/animations/anim-on-init.directive';
import {OverlayHandleEvent, StickerOverlayComponent} from './sticker-overlay/sticker-overlay.component';
import {StickerAnimState} from '../primitives/sticker-item/sticker-item.component';
import {outsetNormalizedBounds, STICKER_ALPHA_MASK_OUTSET_PX} from '../model/sticker-alpha-mask';
import {BoundingBox} from '../model/types';
import {preloadSprite} from '../model/sprite-url.util';
import * as ops from '../model/sticker-placement-ops';
import {stickerIntrinsicSizeRevision} from '../model/sticker-intrinsic-size';
import {preloadAssetUrls} from '../../../core/assets/asset-url-cache';

@Component({
  selector: 'app-sticker-placement-canvas',
  standalone: true,
  imports: [
    CommonModule, StickerActionBarComponent,
    AnimOnInitDirective, StickerOverlayComponent,
  ],
  templateUrl: './sticker-placement-canvas.component.html',
  host: {class: 'block w-full h-full'},
})
export class StickerPlacementCanvasComponent implements AfterViewInit, AfterViewChecked, OnDestroy {

  readonly stickersOnCanvas = input<StickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly stickerSizeOverride = input<number | null>(null);
  readonly showStickerShadow = input<boolean>(false);
  readonly inputElement = input<HTMLElement | null>(null);
  readonly stickerShadowOffsetX = input<number>(6);
  readonly stickerShadowOffsetY = input<number>(6);
  readonly readonlyMode = input<boolean>(false);
  readonly editablePlacementIds = input<string[] | null>(null);
  readonly unlockablePlacementIds = input<string[] | null>(null);
  readonly placementBounds = input<renderModel.PlacementBounds | null>(null);
  readonly consumeSelectionClearEvents = input<boolean>(true);
  readonly coalescePointerMoves = input<boolean>(true);
  readonly showActionBar = input<boolean>(true);
  readonly showOverlayHandles = input<boolean>(true);
  readonly decorativeStickerMotion = input<boolean>(false);
  readonly decorativeStickerMotionDelays = input<Record<string, string>>({});
  readonly minStickerScale = input<number>(STICKERMANIA_CONFIG.placementCanvas.minStickerScale);
  readonly maxStickerScale = input<number>(STICKERMANIA_CONFIG.placementCanvas.maxStickerScale);

  readonly placementsChanged = output<StickerPlacement[]>();
  readonly selectionChanged = output<boolean>();
  readonly moveActiveChanged = output<boolean>();
  readonly movePointerChanged = output<{clientX: number; clientY: number}>();
  readonly stickerAnimStatesChanged = output<Record<string, StickerAnimState>>();

  @ViewChild('canvasArea') private canvasArea!: ElementRef<HTMLDivElement>;

  // ── State ─────────────────────────────────────────────────────

  readonly selectionState = new CanvasSelectionState();
  private readonly overlayInteraction = new StickerCanvasOverlayInteractionState();
  readonly canvasW = signal(400);
  readonly canvasH = signal(400);
  readonly actionBarViewportBounds = signal<ActionBarViewportBounds | null>(null);
  readonly actionBarSpacing = 20;

  readonly stickerSizePx = computed(() => this.stickerSizeOverride() ?? Math.round(this.canvasW() / 2));
  readonly catalogById = computed(() => renderModel.stickerCatalogMap(this.stickerCatalog()));
  private readonly alphaMaskPreloader = new StickerAlphaMaskPreloader(() => this.stickerCatalog());
  readonly stickerAlphaBounds = this.alphaMaskPreloader.bounds;
  private readonly selectionPresentation = new StickerCanvasSelectionPresentation({
    placements: () => this.stickersOnCanvas(),
    catalogById: () => this.catalogById(),
    stickerSizePx: () => this.stickerSizePx(),
    alphaBounds: () => this.stickerAlphaBounds(),
    readonlyMode: () => this.readonlyMode(),
    showActionBar: () => this.showActionBar(),
    editablePlacementIds: () => this.editablePlacementIds(),
    unlockablePlacementIds: () => this.unlockablePlacementIds(),
    getRenderedSize: id => this.getRenderedSize(id),
    selectionState: this.selectionState,
    overlayInteraction: this.overlayInteraction,
  });
  readonly lockedActionBarPlacementId = this.selectionPresentation.lockedActionBarPlacementId;
  readonly selectionIds = this.selectionPresentation.selectionIds;
  readonly actionBarVisible = this.selectionPresentation.actionBarVisible;
  readonly actionBarMode = this.selectionPresentation.actionBarMode;
  readonly actionBarBox = this.selectionPresentation.actionBarBox;
  readonly actionBarCenterX = this.selectionPresentation.actionBarCenterX;
  readonly actionBarCenterY = this.selectionPresentation.actionBarCenterY;
  readonly actionBarRotation = this.selectionPresentation.actionBarRotation;
  readonly overlayVisible = this.selectionPresentation.overlayVisible;
  readonly overlayRotation = this.selectionPresentation.overlayRotation;
  readonly overlayBox = this.selectionPresentation.overlayBox;
  readonly overlayRotationOrigin = this.selectionPresentation.overlayRotationOrigin;

  // ── Internals ─────────────────────────────────────────────────

  private gesture!: StickerGestureHandler;
  private domBindings: StickerCanvasDomBindings | null = null;
  private lastSelectionActive = false;
  private readonly viewReady = signal(false);
  private readonly animationController = new StickerCanvasAnimationController(
    states => this.stickerAnimStatesChanged.emit(states),
  );
  private readonly editController = new StickerCanvasEditController({
    placements: () => this.stickersOnCanvas(),
    selectionIds: () => this.selectionIds(),
    canEditPlacements: ids => this.arePlacementsEditable(ids),
    overlayBox: () => this.overlayBox(),
    overlayRotation: () => this.overlayRotation(),
    canvasRect: () => this.canvasArea.nativeElement.getBoundingClientRect(),
    getRenderedSize: id => this.getRenderedSize(id),
    minScale: () => this.minStickerScale(),
    maxScale: () => this.maxStickerScale(),
    overlayInteraction: this.overlayInteraction,
    commitPlacements: placements => this.commitPlacements(placements),
    emitPlacementsChanged: placements => this.placementsChanged.emit(placements),
    clearSelection: () => this.clearSelection(),
    selectIds: (ids, mode) => this.selectionState.selectIds(ids, mode),
    setEntering: ids => ids.forEach(id => this.setAnimState(id, 'entering')),
    setSettling: ids => ids.forEach(id => this.setAnimState(id, 'settling')),
    scheduleRemoval: (ids, done) => this.scheduleRemoval(ids, done),
  });
  readonly stickerAnimStateFor = (id: string) => this.animationController.get(id);

  setAnimState(id: string, state: StickerAnimState): void {
    this.animationController.set(id, state);
  }

  clearAnimState(id: string): void {
    this.animationController.clear(id);
  }

  scheduleRemoval(ids: string[], done: () => void): void {
    this.animationController.scheduleRemoval(ids, done);
  }

  onStickerAnimRemoved(id: string): void {
    this.animationController.onRemoved(id);
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  constructor() {
    effect(() => {
      this.gesture?.syncState(this.stickersOnCanvas(), this.selectionState);
    });
    effect(() => {
      const ids = this.selectionIds();
      if (!ids.length) return;
      const placementIds = new Set(this.stickersOnCanvas().map(placement => placement.instanceId));
      if (ids.some(id => !placementIds.has(id))) {
        this.clearSelection();
      }
    });
    effect(() => {
      const lockedId = this.lockedActionBarPlacementId();

      if (lockedId && !this.isPlacementUnlockable(lockedId)) {
        this.lockedActionBarPlacementId.set(null);
      }
    });
    effect(() => {
      const active = this.selectionState.hasSelection();
      if (!active) {
        this.clearOverlayState();
      }
      if (active === this.lastSelectionActive) return;
      this.lastSelectionActive = active;
      this.selectionChanged.emit(active);
    });
    effect(() => {
      this.alphaMaskPreloader.sync(this.stickersOnCanvas(), true);
    });
    effect(() => {
      const catalog = this.catalogById();
      preloadAssetUrls(this.stickersOnCanvas().map(placement => catalog.get(placement.stickerId)?.imageUrl));
    });
    effect(() => {
      if (!this.viewReady()) {
        return;
      }

      this.inputElement();
      this.installDomBindings();
    });
  }

  ngAfterViewInit(): void {
    preloadSprite();
    this.gesture = new StickerGestureHandler(
      () => this.canvasArea.nativeElement.getBoundingClientRect(),
      (cx, cy) => hitTestOnCanvas(
        cx, cy, this.canvasArea.nativeElement.getBoundingClientRect(),
        this.stickersOnCanvas(),
        placement => this.hitGeometryForPlacement(placement),
        {preferPlacement: placement => !this.isPlacementLocked(placement.instanceId)},
      ),
      this.buildGestureCallbacks(),
      id => this.isPlacementEditable(id),
      () => this.consumeSelectionClearEvents(),
    );

    this.viewReady.set(true);
  }

  ngOnDestroy(): void {
    this.viewReady.set(false);
    this.domBindings?.destroy();
    this.alphaMaskPreloader.destroy();
    this.animationController.destroy();
  }

  ngAfterViewChecked(): void {
    if (this.actionBarVisible()) {
      this.updateActionBarViewportBounds();
    }
  }

  // ── Gesture handler callbacks ─────────────────────────────────

  private buildGestureCallbacks(): GestureCallbacks {
    return {
      onPlacementsChanged: p => this.placementsChanged.emit(p),
      onSelectedChanged: id => {
        this.clearSelection();
        if (id) this.selectionState.selectSingle(id);
      },
      onMoveActiveChanged: active => {
        this.selectionState.isMoveActive.set(active);
        this.moveActiveChanged.emit(active);
      },
      onMovePointerChanged: point => this.movePointerChanged.emit(point),
      onPointerUpCommit: ids => ids.forEach(id => this.setAnimState(id, 'settling')),
      clampPlacements: (placements, ids) => this.clampPlacementsToBounds(placements, ids),
    };
  }

  // ── Public API ────────────────────────────────────────────────

  generateInstanceId(): string {
    return ops.generateInstanceId();
  }

  clearSelection(): void {
    this.selectionState.clear();
    this.selectionState.isMoveActive.set(false);
    this.lockedActionBarPlacementId.set(null);
    this.clearOverlayState();
  }

  showLockedActionBar(instanceId: string): boolean {
    if (!this.isPlacementUnlockable(instanceId)) {
      this.lockedActionBarPlacementId.set(null);
      return false;
    }

    this.selectionState.clear();
    this.selectionState.isMoveActive.set(false);
    this.clearOverlayState();
    this.lockedActionBarPlacementId.set(instanceId);
    return true;
  }

  cancelActiveGesture(): void {
    this.gesture?.cancelInteraction(true);
    this.selectionState.isMoveActive.set(false);
    this.moveActiveChanged.emit(false);
    this.clearOverlayState();
  }

  nudgeActiveMove(dx: number, dy: number): void {
    this.gesture?.nudgeActiveMove(dx, dy);
  }

  selectSticker(instanceId: string): void {
    this.clearSelection();
    this.selectionState.selectSingle(instanceId);
  }

  private clearOverlayState(): void {
    this.overlayInteraction.clear();
  }

  private installDomBindings(): void {
    this.domBindings?.destroy();
    this.domBindings = new StickerCanvasDomBindings({
      canvasElement: this.canvasArea.nativeElement,
      inputElement: this.inputElement(),
      gesture: this.gesture,
      syncGesture: () => this.gesture.syncState(this.stickersOnCanvas(), this.selectionState),
      inputBlocked: () => this.readonlyMode(),
      coalescePointerMoves: () => this.coalescePointerMoves(),
      hasSelection: () => this.selectionState.hasSelection(),
      clearSelection: () => this.clearSelection(),
      setCanvasSize: (width, height) => {
        this.canvasW.set(width);
        this.canvasH.set(height);
      },
      updateViewportBounds: () => this.updateActionBarViewportBounds(),
    });
    this.domBindings.install();
  }

  // ── Action bar ─────────────────────────────────────────────────

  onOverlayHandle(ev: OverlayHandleEvent): void {
    this.editController.overlayHandle(ev);
  }

  onActionBarAction(action: ActionBarAction): void {
    switch (action) {
      case 'unlock': {
        this.unlockLockedActionBarPlacement();
        return;
      }
      case 'close': {
        this.clearSelection();
        return;
      }
      default: {
        this.editController.actionBarAction(action);
      }
    }
  }

  private commitPlacements(updated: StickerPlacement[]): void {
    this.placementsChanged.emit(this.clampPlacementsToBounds(updated));
  }

  // ── Selection/editability helpers ─────────────────────────────

  private getRenderedSize(instanceId: string): { width: number; height: number } {
    stickerIntrinsicSizeRevision();
    return renderModel.stickerRenderedSize(this.stickersOnCanvas(), this.catalogById(), this.stickerSizePx(), instanceId);
  }

  private hitGeometryForPlacement(placement: StickerPlacement): StickerHitGeometry {
    const definition = this.catalogById().get(placement.stickerId);
    const size = this.getRenderedSize(placement.instanceId);
    const overlayBounds = definition?.overlayBounds;

    return {
      ...size,
      pivotX: (overlayBounds?.x ?? 0.5) * size.width,
      pivotY: (overlayBounds?.y ?? 0.5) * size.height,
      bounds: this.hitTestBoundsForSticker(definition, size),
    };
  }

  private hitTestBoundsForSticker(
    definition: StickerDefinition | undefined,
    size: { width: number; height: number },
  ): BoundingBox | null {
    if (!definition) {
      return null;
    }

    return outsetNormalizedBounds(
      this.stickerAlphaBounds().get(definition.id) ?? normalizedBoundsFromOverlayBounds(definition.overlayBounds),
      STICKER_ALPHA_MASK_OUTSET_PX,
      size.width,
      size.height,
    );
  }

  private isPlacementEditable(id: string): boolean {
    return this.selectionPresentation.isPlacementEditable(id);
  }

  private isPlacementLocked(id: string): boolean {
    return this.selectionPresentation.isPlacementLocked(id);
  }

  private isPlacementUnlockable(id: string): boolean {
    return this.selectionPresentation.isPlacementUnlockable(id);
  }

  private unlockLockedActionBarPlacement(): void {
    const instanceId = this.lockedActionBarPlacementId();

    if (!instanceId || !this.isPlacementUnlockable(instanceId)) {
      this.lockedActionBarPlacementId.set(null);
      return;
    }

    this.commitPlacements(
      this.stickersOnCanvas().map(placement => placement.instanceId === instanceId
        ? ({...placement, locked: false} as StickerPlacement)
        : placement),
    );

    this.clearSelection();
  }

  private arePlacementsEditable(ids: string[]): boolean {
    return ids.every(id => this.isPlacementEditable(id));
  }

  // ── Private helpers ───────────────────────────────────────────

  private clampPlacementsToBounds(placements: StickerPlacement[], ids?: string[]): StickerPlacement[] {
    return renderModel.clampPlacementsToBounds(placements, this.placementBounds(), ids);
  }

  private updateActionBarViewportBounds(): void {
    if (typeof window === 'undefined' || !this.canvasArea) {
      this.setActionBarViewportBounds({minX: 0, minY: 0, maxX: this.canvasW(), maxY: this.canvasH()});
      return;
    }

    this.setActionBarViewportBounds(actionBarViewportBoundsForCanvas(
      this.canvasArea.nativeElement,
      {minX: 0, minY: 0, maxX: this.canvasW(), maxY: this.canvasH()},
    ));
  }

  private setActionBarViewportBounds(next: ActionBarViewportBounds): void {
    if (viewportBoundsEqual(this.actionBarViewportBounds(), next)) {
      return;
    }
    this.actionBarViewportBounds.set(next);
  }

}
