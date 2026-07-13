import {PointerSession, type PointerSessionPoint} from "../../../../../shared/input/pointer-session";
import type {PointerSurfaceHandler} from "../../../../../shared/input/pointer-surface-handler";
import {wheelZoomFactor} from "../../../../../shared/input/wheel-zoom";
import type {CanvasPoint, PaintTool} from "../shared/sticker-creator-types";
import {PaintToolInputController} from "./paint-tool-input.controller";

export type PaintInputPinchSnapshot = {
  center: CanvasPoint;
  distance: number;
};

export type PaintCanvasInputHandlerOptions = {
  isSourceLoaded: () => boolean;
  toolbarVisible: () => boolean;
  closeToolbar: () => void;
  tool: () => PaintTool;
  surface: () => HTMLCanvasElement | null;
  toCanvasPoint: (event: PointerEvent) => CanvasPoint;
  toWheelPoint: (event: WheelEvent) => CanvasPoint;
  canvasPixelRatio: () => number;
  showPointerPreview: (clientX: number, clientY: number) => void;
  hidePointerPreview: () => void;
  startStroke: (pointerId: number, point: CanvasPoint) => void;
  continueStroke: (pointerId: number, point: CanvasPoint) => void;
  endStroke: (pointerId: number) => void;
  fillAt: (point: CanvasPoint) => void;
  hasActiveTextBoxAt: (point: CanvasPoint) => boolean;
  editActiveTextBox: () => void;
  startTextBoxDrag: (point: CanvasPoint) => boolean;
  continueTextBoxDrag: (point: CanvasPoint) => void;
  endTextBoxDrag: () => void;
  panBy: (deltaX: number, deltaY: number) => void;
  pinchStart: (snapshot: PaintInputPinchSnapshot) => void;
  pinchMove: (snapshot: PaintInputPinchSnapshot) => void;
  pinchEnd: () => void;
  wheelZoom: (point: CanvasPoint, factor: number) => void;
};

const TOUCH_PAINT_INTENT_THRESHOLD_PX = 4;

export class PaintCanvasInputHandler implements PointerSurfaceHandler {
  private readonly pointerSession: PointerSession<CanvasPoint>;
  private readonly toolInput: PaintToolInputController;
  private lastPanPoint: CanvasPoint | null = null;
  private pinchActive = false;

  constructor(private readonly options: PaintCanvasInputHandlerOptions) {
    this.pointerSession = new PointerSession<CanvasPoint>({
      surface: options.surface,
      toPoint: event => options.toCanvasPoint(event),
      leftMouseOnly: true,
      preventDefault: true,
      capturePointers: true,
    });
    this.toolInput = new PaintToolInputController({
      pointerCount: () => this.pointerSession.count(),
      intentThreshold: () => this.touchPaintIntentThreshold(),
      startStroke: options.startStroke,
      continueStroke: options.continueStroke,
      endStroke: options.endStroke,
      fillAt: options.fillAt,
      hasActiveTextBoxAt: options.hasActiveTextBoxAt,
      editActiveTextBox: options.editActiveTextBox,
      startTextBoxDrag: options.startTextBoxDrag,
      continueTextBoxDrag: options.continueTextBoxDrag,
      endTextBoxDrag: options.endTextBoxDrag,
    });
  }

  pointerDown(event: PointerEvent): void {
    if (!this.options.isSourceLoaded()) {
      return;
    }

    if (this.options.toolbarVisible()) {
      event.preventDefault();
      this.options.closeToolbar();
    }

    if (!this.pointerSession.start(event)) {
      return;
    }

    const point = this.pointForPointer(event.pointerId);

    if (!point) {
      return;
    }

    if (this.pointerSession.count() >= 2) {
      this.startOrMovePinch();
      return;
    }

    this.handleSinglePointerStart(event, point);
  }

  pointerMove(event: PointerEvent): void {
    if (!this.options.isSourceLoaded()) {
      return;
    }

    this.options.showPointerPreview(event.clientX, event.clientY);

    if (!this.pointerSession.move(event)) {
      return;
    }

    const point = this.pointForPointer(event.pointerId);

    if (!point) {
      return;
    }

    if (this.pointerSession.count() >= 2) {
      this.startOrMovePinch();
      return;
    }

    if (this.toolInput.move(event.pointerId, point)) {
      return;
    }

    if (!this.lastPanPoint) {
      return;
    }

    this.options.panBy(point.x - this.lastPanPoint.x, point.y - this.lastPanPoint.y);
    this.lastPanPoint = point;
  }

  pointerUp(event: PointerEvent): void {
    if (!this.pointerSession.has(event.pointerId)) {
      return;
    }

    this.toolInput.complete(event.pointerId);
    this.pointerSession.end(event);
    this.afterPointerEnded();
  }

  pointerCancel(event: PointerEvent): void {
    this.toolInput.cancel(event.pointerId);
    this.pointerSession.cancel(event);
    this.afterPointerEnded();
  }

  pointerLeave(event: PointerEvent): void {
    if (!this.toolInput.hasActiveInteraction()) {
      this.options.hidePointerPreview();
    }
  }

  wheel(event: WheelEvent): void {
    if (!this.options.isSourceLoaded()) {
      return;
    }

    event.preventDefault();
    this.options.wheelZoom(this.options.toWheelPoint(event), wheelZoomFactor(event.deltaY));
  }

  cancel(): void {
    this.toolInput.cancelAll();
    this.lastPanPoint = null;
    this.endPinchIfActive();
    this.pointerSession.clear();
  }

  dispose(): void {
    this.cancel();
  }

  isPanning(): boolean {
    return this.lastPanPoint !== null && !this.toolInput.hasActiveInteraction() && !this.pinchActive;
  }

  private handleSinglePointerStart(event: PointerEvent, point: CanvasPoint): void {
    if (this.toolInput.start(event, point, this.options.tool())) {
      this.lastPanPoint = null;
      return;
    }

    this.lastPanPoint = point;
  }

  private startOrMovePinch(): void {
    this.toolInput.prepareForPinch();
    this.lastPanPoint = null;
    this.options.hidePointerPreview();

    const snapshot = this.currentPinchSnapshot();

    if (!snapshot) {
      return;
    }

    if (!this.pinchActive) {
      this.pinchActive = true;
      this.options.pinchStart(snapshot);
      return;
    }

    this.options.pinchMove(snapshot);
  }

  private afterPointerEnded(): void {
    if (this.pointerSession.count() < 2) {
      this.endPinchIfActive();
    }

    const remainingPoint = this.pointerSession.firstPoint();

    if (remainingPoint) {
      this.lastPanPoint = remainingPoint.point;
      return;
    }

    this.lastPanPoint = null;
    this.options.hidePointerPreview();
  }

  private endPinchIfActive(): void {
    if (!this.pinchActive) {
      return;
    }

    this.pinchActive = false;
    this.options.pinchEnd();
  }

  private pointForPointer(pointerId: number): CanvasPoint | null {
    return this.pointerSession.points().find(point => point.pointerId === pointerId)?.point ?? null;
  }

  private currentPinchSnapshot(): PaintInputPinchSnapshot | null {
    const pair = this.pointerSession.twoPoints();

    if (!pair) {
      return null;
    }

    const [first, second] = pair;
    return {
      center: midpoint(first, second),
      distance: Math.hypot(second.point.x - first.point.x, second.point.y - first.point.y),
    };
  }

  private touchPaintIntentThreshold(): number {
    return TOUCH_PAINT_INTENT_THRESHOLD_PX * this.options.canvasPixelRatio();
  }
}

function midpoint(first: PointerSessionPoint<CanvasPoint>, second: PointerSessionPoint<CanvasPoint>): CanvasPoint {
  return {
    x: (first.point.x + second.point.x) / 2,
    y: (first.point.y + second.point.y) / 2,
  };
}
