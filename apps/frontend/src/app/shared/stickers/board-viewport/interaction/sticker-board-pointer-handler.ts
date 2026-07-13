import {StickerBoardCameraController} from '../camera/sticker-board-camera.controller';
import {BoardPoint} from '../geometry/sticker-board-types';
import {viewportPointFromClient} from '../geometry/sticker-board-geometry';
import { capturePointer } from "../../../input/pointer-event-utils";
import {stickerCanvasPointerHitFromEvent} from "../../placement-canvas/interaction/sticker-hit-test.util";

export type NonEditablePlacementTap = {
  instanceId: string;
  clientX: number;
  clientY: number;
};

export type StickerBoardPointerHandlerOptions = {
  camera: StickerBoardCameraController;
  viewportElement: () => HTMLElement | null;
  readonlyMode: () => boolean;
  zoomEnabled: () => boolean;
  isPanning: () => boolean;
  isPlacementEditable: (instanceId: string) => boolean;
  clearSelection: () => void;
  cancelStickerGesture: () => void;
  nonEditablePlacementTapped: (tap: NonEditablePlacementTap) => void;
};

export class StickerBoardPointerHandler {
  private readonly deferredStickerPointers = new Map<number, BoardPoint>();
  private readonly activeCameraPointers = new Set<number>();
  private readonly nonEditableTapCandidates = new Map<number, {instanceId: string; startPoint: BoardPoint; clientX: number; clientY: number}>();
  private readonly nonEditableTapMoveThreshold = 8;

  constructor(private readonly options: StickerBoardPointerHandlerOptions) {}

  cursor(): string {
    if (!this.options.zoomEnabled()) {
      return "default";
    }

    if (this.options.isPanning()) {
      return "grabbing";
    }

    return this.options.readonlyMode() ? "grab" : "crosshair";
  }

  pointerDown(event: PointerEvent): void {
    if (!this.options.zoomEnabled()) {
      return;
    }

    this.options.camera.cancelCameraTween();

    if (this.isOverlayHandlePointerEvent(event)) {
      this.options.camera.cancelGesture(event.pointerId);
      this.activeCameraPointers.delete(event.pointerId);
      return;
    }

    const viewport = this.options.viewportElement();

    if (!viewport) {
      return;
    }

    const point = this.viewportPoint(event, viewport);
    const stickerInstanceId = this.stickerInstanceIdFromEvent(event);

    if (this.shouldPromoteToBoardGesture(event)) {
      this.promoteDeferredStickerPointers(viewport, event, point);
      return;
    }

    if (!this.options.readonlyMode() && stickerInstanceId && !this.options.isPlacementEditable(stickerInstanceId)) {
      event.preventDefault();
      this.options.clearSelection();
      this.nonEditableTapCandidates.set(event.pointerId, {
        instanceId: stickerInstanceId,
        startPoint: point,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      this.startCameraPointer(viewport, event.pointerId, point);
      return;
    }

    if (!this.options.readonlyMode() && stickerInstanceId && this.options.isPlacementEditable(stickerInstanceId)) {
      if (event.pointerType === "touch" && this.activeCameraPointers.size > 0) {
        event.preventDefault();
        this.options.clearSelection();
        this.options.cancelStickerGesture();
        this.startCameraPointer(viewport, event.pointerId, point);
        return;
      }

      if (event.pointerType === "touch") {
        this.deferredStickerPointers.set(event.pointerId, point);
      }
      this.options.camera.cancelGesture(event.pointerId);
      this.activeCameraPointers.delete(event.pointerId);
      return;
    }

    this.startCameraPointer(viewport, event.pointerId, point);

    event.preventDefault();

    if (!this.options.readonlyMode()) {
      this.options.clearSelection();
    }

  }

  pointerMove(event: PointerEvent): void {
    if (this.isOverlayHandlePointerEvent(event)) {
      this.options.camera.cancelGesture(event.pointerId);
      this.activeCameraPointers.delete(event.pointerId);
      return;
    }

    if (!this.options.zoomEnabled()) {
      return;
    }

    const viewport = this.options.viewportElement();

    if (!viewport) {
      return;
    }

    const point = this.viewportPoint(event, viewport);

    if (this.deferredStickerPointers.has(event.pointerId)) {
      this.deferredStickerPointers.set(event.pointerId, point);
    }

    const nonEditableTapCandidate = this.nonEditableTapCandidates.get(event.pointerId);
    if (nonEditableTapCandidate && this.distance(point, nonEditableTapCandidate.startPoint) > this.nonEditableTapMoveThreshold) {
      this.nonEditableTapCandidates.delete(event.pointerId);
    }

    if (this.options.camera.movePointer(event.pointerId, point)) {
      event.preventDefault();
    }
  }

  pointerUp(event: PointerEvent): void {
    if (this.isOverlayHandlePointerEvent(event)) {
      this.options.camera.cancelGesture(event.pointerId);
      this.activeCameraPointers.delete(event.pointerId);
      return;
    }

    const nonEditableTapCandidate = this.nonEditableTapCandidates.get(event.pointerId);
    if (nonEditableTapCandidate) {
      this.options.nonEditablePlacementTapped({
        instanceId: nonEditableTapCandidate.instanceId,
        clientX: event.clientX,
        clientY: event.clientY,
      });
      this.nonEditableTapCandidates.delete(event.pointerId);
    }

    this.deferredStickerPointers.delete(event.pointerId);
    this.activeCameraPointers.delete(event.pointerId);
    this.options.camera.endPointer(event.pointerId);
  }

  pointerCancel(event: PointerEvent): void {
    this.nonEditableTapCandidates.delete(event.pointerId);
    this.deferredStickerPointers.delete(event.pointerId);
    this.activeCameraPointers.delete(event.pointerId);
    this.options.camera.endPointer(event.pointerId);
  }

  wheel(event: WheelEvent): void {
    if (!this.options.zoomEnabled()) {
      return;
    }

    this.options.camera.cancelCameraTween();

    const viewport = this.options.viewportElement();

    if (!viewport) {
      return;
    }

    event.preventDefault();

    if (!this.options.readonlyMode()) {
      this.options.clearSelection();
    }

    const point = viewportPointFromClient(viewport.getBoundingClientRect(), event.clientX, event.clientY);

    this.options.camera.wheelAtViewportPoint(point, event.deltaY);
  }

  private viewportPoint(event: PointerEvent, viewport: HTMLElement): BoardPoint {
    return viewportPointFromClient(viewport.getBoundingClientRect(), event.clientX, event.clientY);
  }

  private capturePointer(element: HTMLElement, pointerId: number): void {
    capturePointer(element, pointerId);
  }

  private shouldPromoteToBoardGesture(event: PointerEvent): boolean {
    return event.pointerType === "touch"
      && this.deferredStickerPointers.size > 0
      && !this.deferredStickerPointers.has(event.pointerId);
  }

  private promoteDeferredStickerPointers(viewport: HTMLElement, event: PointerEvent, point: BoardPoint): void {
    event.preventDefault();
    this.options.clearSelection();
    this.options.cancelStickerGesture();
    this.options.camera.cancelGesture();
    this.activeCameraPointers.clear();
    this.nonEditableTapCandidates.clear();

    for (const [pointerId, deferredPoint] of this.deferredStickerPointers) {
      this.startCameraPointer(viewport, pointerId, deferredPoint);
    }

    this.deferredStickerPointers.clear();
    this.startCameraPointer(viewport, event.pointerId, point);
  }

  private startCameraPointer(viewport: HTMLElement, pointerId: number, point: BoardPoint): void {
    this.activeCameraPointers.add(pointerId);
    this.options.camera.startPointer(pointerId, point);
    this.capturePointer(viewport, pointerId);
  }

  private stickerInstanceIdFromEvent(event: PointerEvent): string | null {
    return stickerCanvasPointerHitFromEvent(event)?.instanceId ?? null;
  }

  private isOverlayHandlePointerEvent(event: PointerEvent): boolean {
    return !!(event.target as HTMLElement | null)?.closest?.("[data-overlay-handle]");
  }

  private distance(firstPoint: BoardPoint, secondPoint: BoardPoint): number {
    return Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
  }
}
