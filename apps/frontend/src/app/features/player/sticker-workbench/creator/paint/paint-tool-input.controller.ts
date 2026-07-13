import type {CanvasPoint, PaintTool} from "../shared/sticker-creator-types";
import {paintToolUsesBrushSize} from "./paint-tool-ui";

type PendingTouchPaintAction = {
  pointerId: number;
  kind: "stroke" | "fill";
  startPoint: CanvasPoint;
};

type PendingTextInteraction = {
  pointerId: number;
  startPoint: CanvasPoint;
  dragging: boolean;
};

export type PaintToolInputControllerOptions = {
  pointerCount: () => number;
  intentThreshold: () => number;
  startStroke: (pointerId: number, point: CanvasPoint) => void;
  continueStroke: (pointerId: number, point: CanvasPoint) => void;
  endStroke: (pointerId: number) => void;
  fillAt: (point: CanvasPoint) => void;
  hasActiveTextBoxAt: (point: CanvasPoint) => boolean;
  editActiveTextBox: () => void;
  startTextBoxDrag: (point: CanvasPoint) => boolean;
  continueTextBoxDrag: (point: CanvasPoint) => void;
  endTextBoxDrag: () => void;
};

export class PaintToolInputController {
  private pendingTouchPaintAction: PendingTouchPaintAction | null = null;
  private pendingTextInteraction: PendingTextInteraction | null = null;
  private activeStrokePointerId: number | null = null;
  private activeTextBoxDragPointerId: number | null = null;

  constructor(private readonly options: PaintToolInputControllerOptions) {}

  start(event: PointerEvent, point: CanvasPoint, tool: PaintTool): boolean {
    if (tool === "fill") {
      if (event.pointerType === "touch") {
        this.pendingTouchPaintAction = {
          pointerId: event.pointerId,
          kind: "fill",
          startPoint: point,
        };
      } else {
        this.options.fillAt(point);
      }
      return true;
    }

    if (tool === "text") {
      if (!this.options.hasActiveTextBoxAt(point)) {
        return false;
      }

      this.pendingTextInteraction = {
        pointerId: event.pointerId,
        startPoint: point,
        dragging: false,
      };
      return true;
    }

    if (!paintToolUsesBrushSize(tool)) {
      return false;
    }

    if (event.pointerType === "touch") {
      this.pendingTouchPaintAction = {
        pointerId: event.pointerId,
        kind: "stroke",
        startPoint: point,
      };
    } else {
      this.startStroke(event.pointerId, point);
    }
    return true;
  }

  move(pointerId: number, point: CanvasPoint): boolean {
    if (this.movePendingTextInteraction(pointerId, point)) {
      return true;
    }

    if (this.movePendingTouchPaintAction(pointerId, point)) {
      return true;
    }

    if (this.activeStrokePointerId === pointerId) {
      this.options.continueStroke(pointerId, point);
      return true;
    }

    if (this.activeTextBoxDragPointerId === pointerId) {
      this.options.continueTextBoxDrag(point);
      return true;
    }

    return false;
  }

  complete(pointerId: number): void {
    this.completePendingTouchPaintAction(pointerId);
    this.completePendingTextInteraction(pointerId);
    this.finishStroke(pointerId);
    this.finishTextBoxDrag(pointerId);
  }

  cancel(pointerId: number): void {
    this.cancelPendingTouchPaintAction(pointerId);
    this.cancelPendingTextInteraction(pointerId);
    this.finishStroke(pointerId);
    this.finishTextBoxDrag(pointerId);
  }

  cancelAll(): void {
    this.pendingTouchPaintAction = null;
    this.pendingTextInteraction = null;
    this.activeStrokePointerId = null;
    this.activeTextBoxDragPointerId = null;
  }

  prepareForPinch(): void {
    this.cancelPendingTouchPaintAction();
    this.finishActiveStroke();
  }

  hasActiveInteraction(): boolean {
    return this.activeStrokePointerId !== null || this.activeTextBoxDragPointerId !== null;
  }

  private movePendingTextInteraction(pointerId: number, point: CanvasPoint): boolean {
    const pending = this.pendingTextInteraction;
    if (!pending || pending.pointerId !== pointerId) return false;

    if (this.options.pointerCount() !== 1) {
      this.cancelPendingTextInteraction(pointerId);
      return true;
    }

    if (!pending.dragging) {
      if (distance(point, pending.startPoint) < this.options.intentThreshold()) {
        return true;
      }

      if (!this.startTextBoxDrag(pointerId, pending.startPoint)) {
        this.cancelPendingTextInteraction(pointerId);
        return false;
      }
      pending.dragging = true;
    }

    this.options.continueTextBoxDrag(point);
    return true;
  }

  private completePendingTextInteraction(pointerId: number): void {
    const pending = this.pendingTextInteraction;
    if (!pending || pending.pointerId !== pointerId) return;

    this.pendingTextInteraction = null;
    if (!pending.dragging && this.options.pointerCount() === 1) {
      this.options.editActiveTextBox();
    }
  }

  private cancelPendingTextInteraction(pointerId?: number): void {
    if (pointerId === undefined || this.pendingTextInteraction?.pointerId === pointerId) {
      this.pendingTextInteraction = null;
    }
  }

  private movePendingTouchPaintAction(pointerId: number, point: CanvasPoint): boolean {
    const pending = this.pendingTouchPaintAction;
    if (!pending || pending.pointerId !== pointerId) return false;

    if (this.options.pointerCount() !== 1) {
      this.cancelPendingTouchPaintAction(pointerId);
      return true;
    }

    const movedDistance = distance(point, pending.startPoint);
    if (pending.kind === "fill") {
      if (movedDistance >= this.options.intentThreshold()) {
        this.cancelPendingTouchPaintAction(pointerId);
      }
      return true;
    }

    if (movedDistance < this.options.intentThreshold()) {
      return true;
    }

    this.pendingTouchPaintAction = null;
    this.startStroke(pointerId, pending.startPoint);
    this.options.continueStroke(pointerId, point);
    return true;
  }

  private completePendingTouchPaintAction(pointerId: number): void {
    const pending = this.pendingTouchPaintAction;
    if (!pending || pending.pointerId !== pointerId) return;

    this.pendingTouchPaintAction = null;
    if (this.options.pointerCount() !== 1) return;

    if (pending.kind === "fill") {
      this.options.fillAt(pending.startPoint);
      return;
    }

    this.startStroke(pointerId, pending.startPoint);
    this.finishStroke(pointerId);
  }

  private cancelPendingTouchPaintAction(pointerId?: number): void {
    if (pointerId === undefined || this.pendingTouchPaintAction?.pointerId === pointerId) {
      this.pendingTouchPaintAction = null;
    }
  }

  private startTextBoxDrag(pointerId: number, point: CanvasPoint): boolean {
    if (!this.options.startTextBoxDrag(point)) return false;
    this.activeTextBoxDragPointerId = pointerId;
    return true;
  }

  private finishTextBoxDrag(pointerId: number): void {
    if (this.activeTextBoxDragPointerId !== pointerId) return;
    this.activeTextBoxDragPointerId = null;
    this.options.endTextBoxDrag();
  }

  private startStroke(pointerId: number, point: CanvasPoint): void {
    this.activeStrokePointerId = pointerId;
    this.options.startStroke(pointerId, point);
  }

  private finishStroke(pointerId: number): void {
    if (this.activeStrokePointerId !== pointerId) return;
    this.activeStrokePointerId = null;
    this.options.endStroke(pointerId);
  }

  private finishActiveStroke(): void {
    const pointerId = this.activeStrokePointerId;
    if (pointerId !== null) {
      this.finishStroke(pointerId);
    }
  }
}

function distance(first: CanvasPoint, second: CanvasPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}
