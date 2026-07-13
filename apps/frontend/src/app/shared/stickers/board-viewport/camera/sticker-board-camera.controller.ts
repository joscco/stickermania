import {signal} from "@angular/core";
import type {BoardBounds, BoardPoint, StickerBoardViewConfig} from "../geometry/sticker-board-types";
import {boardHeight, boardWidth, wheelZoomFactor} from "../geometry/sticker-board-geometry";

export type StickerBoardCameraProfile = "view" | "edit";

export type StickerBoardCameraOptions = {
  bounds: BoardBounds;
  view: StickerBoardViewConfig;
  contentPaddingPx: () => number;
  cameraOverscrollPx: () => number;
  profile: () => StickerBoardCameraProfile;
};

type BoardPinchStart = {
  distance: number;
  zoom: number;
  boardX: number;
  boardY: number;
};

type BoardPanStart = {
  pointerId: number;
  point: BoardPoint;
  panX: number;
  panY: number;
};

export class StickerBoardCameraController {
  readonly zoom = signal(1);
  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly viewportW = signal(1);
  readonly viewportH = signal(1);
  readonly isPanning = signal(false);
  readonly isGestureActive = signal(false);

  private readonly boardWidth: number;
  private readonly boardHeight: number;
  private readonly pointers = new Map<number, BoardPoint>();

  private pinchStart: BoardPinchStart | null = null;
  private panStart: BoardPanStart | null = null;
  private hasInitializedCamera = false;
  private lastCameraProfile: StickerBoardCameraProfile | null = null;
  private cameraTweenFrameId: number | null = null;

  constructor(private readonly options: StickerBoardCameraOptions) {
    this.boardWidth = boardWidth(options.bounds);
    this.boardHeight = boardHeight(options.bounds);
  }

  setViewportSize(width: number, height: number): void {
    const previousCenter = this.hasInitializedCamera
      ? this.boardPointAtViewportPoint({x: this.viewportW() / 2, y: this.viewportH() / 2})
      : null;

    this.viewportW.set(Math.max(1, width));
    this.viewportH.set(Math.max(1, height));

    if (!this.hasInitializedCamera) {
      this.initializeCamera();
      return;
    }

    this.preserveCameraOnResize(previousCenter);
  }

  applyProfileIfChanged(animated = false): boolean {
    const profile = this.options.profile();

    if (!this.hasInitializedCamera || profile === this.lastCameraProfile) {
      return false;
    }

    this.lastCameraProfile = profile;
    this.applyCameraProfile(profile, animated);
    return true;
  }

  startPointer(pointerId: number, point: BoardPoint): "pan" | "pinch" {
    this.pointers.set(pointerId, point);
    this.isGestureActive.set(true);

    if (this.pointers.size >= 2) {
      this.panStart = null;
      this.isPanning.set(false);
      this.pinchStart = this.currentPinchStart();
      return "pinch";
    }

    this.panStart = {pointerId, point, panX: this.panX(), panY: this.panY()};
    this.isPanning.set(true);
    return "pan";
  }

  movePointer(pointerId: number, point: BoardPoint): boolean {
    if (!this.pointers.has(pointerId)) {
      return false;
    }

    this.pointers.set(pointerId, point);

    if (this.pointers.size >= 2 && this.pinchStart) {
      this.applyPinchZoom();
      return true;
    }

    if (this.panStart?.pointerId === pointerId) {
      this.panX.set(this.panStart.panX + point.x - this.panStart.point.x);
      this.panY.set(this.panStart.panY + point.y - this.panStart.point.y);
      this.clampCamera();
      return true;
    }

    return false;
  }

  endPointer(pointerId: number): void {
    this.pointers.delete(pointerId);

    if (this.panStart?.pointerId === pointerId) {
      this.panStart = null;
      this.isPanning.set(false);
    }

    if (this.pointers.size < 2) {
      this.pinchStart = null;

      const remaining = [...this.pointers.entries()][0];

      this.panStart = remaining
        ? {pointerId: remaining[0], point: remaining[1], panX: this.panX(), panY: this.panY()}
        : null;

      this.isPanning.set(!!this.panStart);
    }

    this.isGestureActive.set(this.pointers.size > 0);
  }

  cancelGesture(pointerId?: number): void {
    if (pointerId !== undefined) {
      this.pointers.delete(pointerId);
    } else {
      this.pointers.clear();
    }

    this.pinchStart = null;
    this.panStart = null;
    this.isPanning.set(false);
    this.isGestureActive.set(this.pointers.size > 0);
  }

  wheelAtViewportPoint(point: BoardPoint, deltaY: number): void {
    this.zoomAtViewportPoint(point, this.zoom() * wheelZoomFactor(deltaY));
  }

  panBy(deltaX: number, deltaY: number): BoardPoint {
    if (deltaX === 0 && deltaY === 0) {
      return {x: 0, y: 0};
    }

    const beforeX = this.panX();
    const beforeY = this.panY();

    this.panX.set(beforeX + deltaX);
    this.panY.set(beforeY + deltaY);
    this.clampCamera();

    return {
      x: this.panX() - beforeX,
      y: this.panY() - beforeY,
    };
  }

  boardPointAtViewportPoint(point: BoardPoint): BoardPoint {
    const bounds = this.options.bounds;
    const zoom = this.zoom();

    return {
      x: (point.x - this.panX()) / zoom + bounds.minX,
      y: (point.y - this.panY()) / zoom + bounds.minY,
    };
  }

  destroy(): void {
    this.cancelCameraTween();
    this.cancelGesture();
  }

  cancelCameraTween(): void {
    if (this.cameraTweenFrameId === null) {
      return;
    }

    cancelAnimationFrame(this.cameraTweenFrameId);
    this.cameraTweenFrameId = null;
  }

  private initializeCamera(): void {
    const profile = this.options.profile();
    const fitZoom = this.fitZoomForProfile(profile);

    this.lastCameraProfile = profile;
    this.zoom.set(this.clampZoom(fitZoom));
    this.panX.set((this.viewportW() - this.boardWidth * this.zoom()) / 2);
    this.panY.set((this.viewportH() - this.boardHeight * this.zoom()) / 2);
    this.hasInitializedCamera = true;
    this.clampCamera();
  }

  private applyCameraProfile(profile: StickerBoardCameraProfile, animated = false): void {
    const center = this.boardPointAtViewportPoint({x: this.viewportW() / 2, y: this.viewportH() / 2});
    const nextZoom = this.fitZoomForProfile(profile);
    const target = this.cameraTargetForBoardPoint(center.x, center.y, {x: this.viewportW() / 2, y: this.viewportH() / 2}, nextZoom);

    if (animated) {
      this.tweenCameraTo(target);
      return;
    }

    this.cancelCameraTween();
    this.zoom.set(target.zoom);
    this.panX.set(target.panX);
    this.panY.set(target.panY);
    this.clampCamera();
  }

  private preserveCameraOnResize(previousCenter: BoardPoint | null): void {
    if (!previousCenter) {
      this.clampCamera();
      return;
    }

    const target = this.cameraTargetForBoardPoint(
      previousCenter.x,
      previousCenter.y,
      {x: this.viewportW() / 2, y: this.viewportH() / 2},
      this.zoom(),
    );

    this.cancelCameraTween();
    this.zoom.set(target.zoom);
    this.panX.set(target.panX);
    this.panY.set(target.panY);
    this.clampCamera();
  }

  private fitZoomForProfile(profile: StickerBoardCameraProfile): number {
    const multiplier = profile === "edit" ? this.options.view.editFitZoomMultiplier : 1;

    return this.clampZoomForProfile(this.rawFitZoom() * multiplier, profile);
  }

  private cameraTargetForBoardPoint(boardX: number, boardY: number, point: BoardPoint, zoom: number): {zoom: number; panX: number; panY: number} {
    const bounds = this.options.bounds;
    const rawPanX = point.x - (boardX - bounds.minX) * zoom;
    const rawPanY = point.y - (boardY - bounds.minY) * zoom;

    return {
      zoom,
      panX: this.clampPanAxisForContentSize(rawPanX, this.boardWidth * zoom, this.viewportW()),
      panY: this.clampPanAxisForContentSize(rawPanY, this.boardHeight * zoom, this.viewportH()),
    };
  }

  private tweenCameraTo(target: {zoom: number; panX: number; panY: number}): void {
    this.cancelCameraTween();

    const start = {
      zoom: this.zoom(),
      panX: this.panX(),
      panY: this.panY(),
    };

    const durationMs = 240;
    const startAt = performance.now();

    const step = (now: number) => {
      const time = Math.min(1, (now - startAt) / durationMs);
      const eased = 1 - Math.pow(1 - time, 3);

      this.zoom.set(this.lerp(start.zoom, target.zoom, eased));
      this.panX.set(this.lerp(start.panX, target.panX, eased));
      this.panY.set(this.lerp(start.panY, target.panY, eased));

      if (time < 1) {
        this.cameraTweenFrameId = requestAnimationFrame(step);
        return;
      }

      this.cameraTweenFrameId = null;
      this.zoom.set(target.zoom);
      this.panX.set(target.panX);
      this.panY.set(target.panY);
      this.clampCamera();
    };

    this.cameraTweenFrameId = requestAnimationFrame(step);
  }

  private lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
  }

  private currentPinchStart(): BoardPinchStart | null {
    const points = [...this.pointers.values()];

    if (points.length < 2) {
      return null;
    }

    const [firstPoint, secondPoint] = points;
    const center = this.midpoint(firstPoint, secondPoint);
    const boardPoint = this.boardPointAtViewportPoint(center);

    return {
      distance: Math.max(1, Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y)),
      zoom: this.zoom(),
      boardX: boardPoint.x,
      boardY: boardPoint.y,
    };
  }

  private applyPinchZoom(): void {
    const start = this.pinchStart;
    const points = [...this.pointers.values()];

    if (!start || points.length < 2) {
      return;
    }

    const [firstPoint, secondPoint] = points;
    const center = this.midpoint(firstPoint, secondPoint);
    const distance = Math.max(1, Math.hypot(secondPoint.x - firstPoint.x, secondPoint.y - firstPoint.y));

    this.placeBoardPointAtViewportPoint(start.boardX, start.boardY, center, start.zoom * distance / start.distance);
  }

  private zoomAtViewportPoint(point: BoardPoint, rawZoom: number): void {
    const boardPoint = this.boardPointAtViewportPoint(point);
    this.placeBoardPointAtViewportPoint(boardPoint.x, boardPoint.y, point, rawZoom);
  }

  private placeBoardPointAtViewportPoint(boardX: number, boardY: number, point: BoardPoint, rawZoom: number): void {
    const zoom = this.clampZoom(rawZoom);
    const bounds = this.options.bounds;

    this.zoom.set(zoom);
    this.panX.set(point.x - (boardX - bounds.minX) * zoom);
    this.panY.set(point.y - (boardY - bounds.minY) * zoom);
    this.clampCamera();
  }

  private clampCamera(): void {
    this.zoom.set(this.clampZoom(this.zoom()));
    this.panX.set(this.clampPanAxisForContentSize(this.panX(), this.boardWidth * this.zoom(), this.viewportW()));
    this.panY.set(this.clampPanAxisForContentSize(this.panY(), this.boardHeight * this.zoom(), this.viewportH()));
  }

  private clampZoom(zoom: number): number {
    const profile = this.options.profile();

    return this.clampZoomForProfile(zoom, profile);
  }

  private clampZoomForProfile(zoom: number, profile: StickerBoardCameraProfile): number {
    const min = this.minZoomForProfile(profile);
    const max = profile === "edit" ? this.options.view.editMaxZoom : this.options.view.viewMaxZoom;

    return Math.max(min, Math.min(max, zoom));
  }

  private minZoomForProfile(profile: StickerBoardCameraProfile): number {
    const configuredMin = profile === "edit" ? this.options.view.editMinZoom : this.options.view.viewMinZoom;

    if (profile === "edit") {
      return configuredMin;
    }

    return Math.min(configuredMin, this.rawFitZoom());
  }

  private rawFitZoom(): number {
    const padding = this.options.contentPaddingPx();
    const availableWidth = Math.max(1, this.viewportW() - padding * 2);
    const availableHeight = Math.max(1, this.viewportH() - padding * 2);

    return Math.min(
      1,
      availableWidth / this.boardWidth,
      availableHeight / this.boardHeight,
    );
  }

  private clampPanAxisForContentSize(pan: number, contentSize: number, viewportSize: number): number {
    const padding = this.options.contentPaddingPx();
    const overscroll = this.options.cameraOverscrollPx();

    if (contentSize + padding * 2 <= viewportSize) {
      const centered = (viewportSize - contentSize) / 2;

      return Math.max(centered - overscroll, Math.min(centered + overscroll, pan));
    }

    return Math.max(viewportSize - contentSize - padding - overscroll, Math.min(padding + overscroll, pan));
  }

  private midpoint(firstPoint: BoardPoint, secondPoint: BoardPoint): BoardPoint {
    return {
      x: (firstPoint.x + secondPoint.x) / 2,
      y: (firstPoint.y + secondPoint.y) / 2,
    };
  }
}
