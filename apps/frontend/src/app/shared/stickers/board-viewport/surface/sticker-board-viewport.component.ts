import {CommonModule} from "@angular/common";
import {AfterViewInit, Component, computed, effect, ElementRef, input, OnDestroy, output, signal, ViewChild} from "@angular/core";
import type {BoardStickerPlacement, StickerDefinition, StickerPlacement} from "@stickermania/shared";

import type {PlacementBadge} from '../labels/sticker-board-label-layout';
import type {StickerAnimState} from '../../primitives/sticker-item/sticker-item.component';
import {PixiStickerBoardRendererComponent} from './pixi-sticker-board-renderer.component';
import {StickerPlacementCanvasComponent} from '../../placement-canvas/sticker-placement-canvas.component';
import {BOARD_BOUNDS, BOARD_VIEW_CONFIG, BoardPoint} from '../geometry/sticker-board-types';
import {PointerSurfaceDirective, PointerSurfaceOptions} from '../../../input/pointer-surface.directive';
import {StickerBoardCameraController} from '../camera/sticker-board-camera.controller';
import {StickerBoardPointerHandler} from '../interaction/sticker-board-pointer-handler';
import {PointerSurfaceHandler} from '../../../input/pointer-surface-handler';
import {RafPointerMoveCoalescer} from '../../../input/raf-pointer-move-coalescer';
import {boardHeight, boardToDisplayPlacements, boardWidth, displayToBoardPlacements} from '../geometry/sticker-board-geometry';

@Component({
  selector: "app-sticker-board-viewport",
  standalone: true,
  imports: [
    CommonModule,
    StickerPlacementCanvasComponent,
    PixiStickerBoardRendererComponent,
    PointerSurfaceDirective,
  ],
  templateUrl: "./sticker-board-viewport.component.html",
  host: {class: "block h-full w-full"},
})
export class StickerBoardViewportComponent implements AfterViewInit, OnDestroy {
  readonly bounds = BOARD_BOUNDS;
  readonly placements = input<BoardStickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly boardView = BOARD_VIEW_CONFIG;
  readonly readonlyMode = input(false);
  readonly zoomEnabled = input(true);
  readonly coalescePointerMoves = input(true);
  readonly contentPaddingPx = input(0);
  readonly cameraOverscrollPx = input(180);
  readonly editablePlacementIds = input<string[] | null>(null);
  readonly unlockablePlacementIds = input<string[] | null>(null);
  readonly showPlacementLabels = input(false);
  readonly placementBadges = input<Record<string, PlacementBadge>>({});
  readonly pixiMaxResolution = input(2);
  readonly pixiWarmupFrames = input(2);

  readonly placementsChanged = output<BoardStickerPlacement[]>();
  readonly selectionChanged = output<boolean>();
  readonly nonEditablePlacementTapped = output<{instanceId: string; clientX: number; clientY: number}>();
  readonly viewportCenterChanged = output<BoardPoint>();

  @ViewChild("boardViewport") private boardViewport?: ElementRef<HTMLDivElement>;
  @ViewChild("boardCanvas") private boardCanvas?: StickerPlacementCanvasComponent;

  private readonly camera = new StickerBoardCameraController({
    bounds: this.bounds,
    view: this.boardView,
    contentPaddingPx: () => this.contentPaddingPx(),
    cameraOverscrollPx: () => this.cameraOverscrollPx(),
    profile: () => this.cameraProfile(),
  });

  readonly zoom = this.camera.zoom;
  readonly panX = this.camera.panX;
  readonly panY = this.camera.panY;
  readonly viewportW = this.camera.viewportW;
  readonly viewportH = this.camera.viewportH;
  readonly isPanning = this.camera.isPanning;
  readonly isCameraGestureActive = this.camera.isGestureActive;
  readonly boardWidth = boardWidth(this.bounds);
  readonly boardHeight = boardHeight(this.bounds);

  readonly placementCoordinateScale = computed(() => this.zoom());
  readonly renderBoardWidth = computed(() => this.boardWidth * this.placementCoordinateScale());
  readonly renderBoardHeight = computed(() => this.boardHeight * this.placementCoordinateScale());

  readonly displayPlacementBounds = computed(() => ({
    minX: 0,
    minY: 0,
    maxX: this.renderBoardWidth(),
    maxY: this.renderBoardHeight(),
  }));

  readonly displayPlacements = computed(() =>
    boardToDisplayPlacements(this.placements(), this.bounds, this.placementCoordinateScale()));
  readonly touchAction = computed(() => this.zoomEnabled() ? "none" : "auto");
  readonly boardTransform = computed(() => `translate3d(${this.panX()}px, ${this.panY()}px, 0)`);
  readonly stickerSizeOverride = computed(() => this.boardView.stickerBaseSize * this.placementCoordinateScale());
  readonly stickerShadowOffsetX = computed(() => 2);
  readonly stickerShadowOffsetY = computed(() => 3);
  readonly autoPanMoveActive = signal(false);
  readonly pixiCameraSmoothingMs = computed(() => this.isCameraGestureActive() || this.autoPanMoveActive() ? 0 : 85);
  readonly stickerAnimStates = signal<Record<string, StickerAnimState>>({});


  private readonly pointerHandler = new StickerBoardPointerHandler({
    camera: this.camera,
    viewportElement: () => this.boardViewport?.nativeElement ?? null,
    readonlyMode: () => this.readonlyMode(),
    zoomEnabled: () => this.zoomEnabled(),
    isPanning: () => this.isPanning(),
    isPlacementEditable: instanceId => this.isPlacementEditable(instanceId),
    clearSelection: () => this.clearSelection(),
    cancelStickerGesture: () => this.boardCanvas?.cancelActiveGesture(),
    nonEditablePlacementTapped: tap => {
      if (!this.boardCanvas?.showLockedActionBar(tap.instanceId)) {
        this.nonEditablePlacementTapped.emit(tap);
      }
    },
  });
  readonly boardPointerSurfaceOptions: PointerSurfaceOptions = {
    guards: {applyStyles: false},
  };
  readonly boardPointerSurfaceHandler: PointerSurfaceHandler = {
    pointerDown: event => {
      this.flushQueuedPointerMove();
      this.pointerHandler.pointerDown(event);
    },
    pointerMove: event => this.handlePointerMove(event),
    pointerUp: event => {
      this.flushQueuedPointerMove();
      this.pointerHandler.pointerUp(event);
    },
    pointerCancel: event => {
      this.flushQueuedPointerMove();
      this.pointerHandler.pointerCancel(event);
    },
    wheel: event => {
      this.flushQueuedPointerMove();
      this.pointerHandler.wheel(event);
    },
  };
  private resizeObserver: ResizeObserver | null = null;
  private autoPanFrameId: number | null = null;
  private autoPanLastFrameAt = 0;
  private autoPanPointer: {clientX: number; clientY: number} | null = null;
  private readonly autoPanEdgePx = 56;
  private readonly autoPanMaxSpeedPxPerMs = 0.42;
  private readonly pointerMoveCoalescer = new RafPointerMoveCoalescer(
    event => this.pointerHandler.pointerMove(event),
    event => event.preventDefault(),
  );

  constructor() {
    effect(() => {
      // Keep Angular's camera state as the immediate target. Pixi performs the visual smoothing.
      // This avoids a 60fps Angular tween exactly when the edit overlay is created.
      if (this.camera.applyProfileIfChanged(false)) {
        this.clearSelection();
      }
    });
    effect(() => {
      this.viewportCenterChanged.emit(this.viewportCenterBoardPoint());
    });
  }

  ngAfterViewInit(): void {
    const viewport = this.boardViewport?.nativeElement;

    if (!viewport) {
      return;
    }

    const updateViewport = () => {
      const rect = viewport.getBoundingClientRect();

      this.camera.setViewportSize(rect.width, rect.height);
    };

    updateViewport();

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(updateViewport);
      this.resizeObserver.observe(viewport);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.pointerMoveCoalescer.cancel();
    this.stopAutoPan();
    this.camera.destroy();
  }

  generateInstanceId(): string {
    return this.boardCanvas?.generateInstanceId() ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  clearSelection(): void {
    this.boardCanvas?.clearSelection();
  }

  selectAndAnimate(instanceId: string): void {
    setTimeout(() => {
      this.boardCanvas?.selectSticker(instanceId);
      this.boardCanvas?.setAnimState(instanceId, "entering");
    });
  }

  viewportCenterBoardPoint(): BoardPoint {
    return this.camera.boardPointAtViewportPoint({x: this.viewportW() / 2, y: this.viewportH() / 2});
  }

  onCanvasPlacementsChanged(placements: StickerPlacement[]): void {
    this.placementsChanged.emit(displayToBoardPlacements(placements, this.bounds, this.placementCoordinateScale()));
  }

  onCanvasSelectionChanged(active: boolean): void {
    this.selectionChanged.emit(active);
  }

  onCanvasMoveActiveChanged(active: boolean): void {
    this.autoPanMoveActive.set(active);

    if (!active) {
      this.stopAutoPan();
      return;
    }

    if (this.autoPanPointer) {
      this.startAutoPan();
    }
  }

  onCanvasMovePointerChanged(point: {clientX: number; clientY: number}): void {
    this.autoPanPointer = point;

    if (this.autoPanMoveActive()) {
      this.startAutoPan();
    }
  }

  onCanvasStickerAnimStatesChanged(states: Record<string, StickerAnimState>): void {
    this.stickerAnimStates.set(states);
  }

  boardCursor(): string {
    return this.pointerHandler.cursor();
  }

  private cameraProfile(): "view" | "edit" {
    return this.readonlyMode() ? "view" : "edit";
  }

  private isPlacementEditable(instanceId: string): boolean {
    const placement = this.placements().find(item => item.instanceId === instanceId) as (BoardStickerPlacement & {locked?: boolean}) | undefined;
    if (placement?.locked) {
      return false;
    }

    return this.editablePlacementIds()?.includes(instanceId) ?? true;
  }

  private handlePointerMove(event: PointerEvent): void {
    if (!this.coalescePointerMoves()) {
      this.pointerHandler.pointerMove(event);
      return;
    }

    this.pointerMoveCoalescer.queue(event);
  }

  private flushQueuedPointerMove(): void {
    this.pointerMoveCoalescer.flush();
  }

  private startAutoPan(): void {
    if (this.autoPanFrameId !== null) {
      return;
    }

    this.autoPanLastFrameAt = 0;
    this.autoPanFrameId = requestAnimationFrame(now => this.autoPanStep(now));
  }

  private stopAutoPan(): void {
    if (this.autoPanFrameId !== null) {
      cancelAnimationFrame(this.autoPanFrameId);
      this.autoPanFrameId = null;
    }

    this.autoPanLastFrameAt = 0;
    this.autoPanPointer = null;
    this.autoPanMoveActive.set(false);
  }

  private autoPanStep(now: number): void {
    this.autoPanFrameId = null;

    if (!this.autoPanMoveActive()) {
      this.stopAutoPan();
      return;
    }

    const viewport = this.boardViewport?.nativeElement;
    const pointer = this.autoPanPointer;

    if (!viewport || !pointer) {
      this.startAutoPan();
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const x = pointer.clientX - rect.left;
    const y = pointer.clientY - rect.top;
    const velocityX = this.autoPanVelocity(x, rect.width);
    const velocityY = this.autoPanVelocity(y, rect.height);
    const dt = this.autoPanLastFrameAt === 0 ? 16 : Math.min(34, Math.max(0, now - this.autoPanLastFrameAt));

    this.autoPanLastFrameAt = now;

    if (velocityX !== 0 || velocityY !== 0) {
      const applied = this.camera.panBy(velocityX * dt, velocityY * dt);

      if (applied.x !== 0 || applied.y !== 0) {
        this.boardCanvas?.nudgeActiveMove(-applied.x, -applied.y);
      }
    }

    this.startAutoPan();
  }

  private autoPanVelocity(position: number, viewportSize: number): number {
    const edge = Math.min(this.autoPanEdgePx, viewportSize / 3);

    if (position < edge) {
      return this.autoPanMaxSpeedPxPerMs * (1 - Math.max(0, position) / edge);
    }

    if (position > viewportSize - edge) {
      return -this.autoPanMaxSpeedPxPerMs * (1 - Math.max(0, viewportSize - position) / edge);
    }

    return 0;
  }
}
