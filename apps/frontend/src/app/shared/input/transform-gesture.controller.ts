import {PointerSession, type PointerSessionPoint} from "./pointer-session";
import {wheelZoomFactor} from "./wheel-zoom";

export type GesturePoint = {
  x: number;
  y: number;
};

export type GesturePair<TPoint extends GesturePoint> = {
  first: PointerSessionPoint<TPoint>;
  second: PointerSessionPoint<TPoint>;
};

export type PinchGestureSnapshot<TPoint extends GesturePoint> = {
  center: TPoint;
  distance: number;
  pair: GesturePair<TPoint>;
};

export type TransformGestureEvent<TPoint extends GesturePoint> =
  | {
      type: "panStart";
      pointerId: number;
      point: TPoint;
      sourceEvent: PointerEvent;
    }
  | {
      type: "panMove";
      pointerId: number;
      previousPoint: TPoint;
      point: TPoint;
      deltaX: number;
      deltaY: number;
      sourceEvent: PointerEvent;
    }
  | {
      type: "panEnd";
      sourceEvent?: PointerEvent;
    }
  | {
      type: "pinchStart";
      start: PinchGestureSnapshot<TPoint>;
      sourceEvent: PointerEvent;
    }
  | {
      type: "pinchMove";
      start: PinchGestureSnapshot<TPoint>;
      current: PinchGestureSnapshot<TPoint>;
      scaleFactor: number;
      deltaCenterX: number;
      deltaCenterY: number;
      sourceEvent: PointerEvent;
    }
  | {
      type: "pinchEnd";
      sourceEvent?: PointerEvent;
    }
  | {
      type: "wheelZoom";
      point: TPoint;
      deltaY: number;
      factor: number;
      sourceEvent: WheelEvent;
    };

export type TransformGestureControllerOptions<TPoint extends GesturePoint> = {
  surface: () => HTMLElement | null;
  pointerToPoint: (event: PointerEvent) => TPoint;
  wheelToPoint: (event: WheelEvent) => TPoint;
  onGesture: (gesture: TransformGestureEvent<TPoint>) => void;
  leftMouseOnly?: boolean;
  preventDefault?: boolean;
  stopPropagation?: boolean;
  capturePointers?: boolean;
  wheelZoomFactor?: (event: WheelEvent) => number;
};

export class TransformGestureController<TPoint extends GesturePoint> {
  private readonly pointerSession: PointerSession<TPoint>;
  private lastPanPoint: TPoint | null = null;
  private pinchStart: PinchGestureSnapshot<TPoint> | null = null;

  constructor(private readonly options: TransformGestureControllerOptions<TPoint>) {
    this.pointerSession = new PointerSession<TPoint>({
      surface: options.surface,
      toPoint: event => options.pointerToPoint(event),
      leftMouseOnly: options.leftMouseOnly,
      preventDefault: options.preventDefault,
      stopPropagation: options.stopPropagation,
      capturePointers: options.capturePointers,
    });
  }

  pointerDown(event: PointerEvent): boolean {
    if (!this.pointerSession.start(event)) {
      return false;
    }

    if (this.pointerSession.count() >= 2) {
      this.lastPanPoint = null;
      this.pinchStart = this.currentPinchSnapshot();

      if (this.pinchStart) {
        this.options.onGesture({
          type: "pinchStart",
          start: this.pinchStart,
          sourceEvent: event,
        });
      }

      return true;
    }

    const point = this.pointerSession.firstPoint();

    if (!point) {
      return true;
    }

    this.lastPanPoint = point.point;
    this.options.onGesture({
      type: "panStart",
      pointerId: point.pointerId,
      point: point.point,
      sourceEvent: event,
    });

    return true;
  }

  pointerMove(event: PointerEvent): boolean {
    if (!this.pointerSession.move(event)) {
      return false;
    }

    if (this.pointerSession.count() >= 2) {
      const currentPinch = this.currentPinchSnapshot();

      if (!currentPinch) {
        return true;
      }

      if (!this.pinchStart) {
        this.pinchStart = currentPinch;
        this.options.onGesture({
          type: "pinchStart",
          start: currentPinch,
          sourceEvent: event,
        });
        return true;
      }

      this.options.onGesture({
        type: "pinchMove",
        start: this.pinchStart,
        current: currentPinch,
        scaleFactor: safeScaleFactor(currentPinch.distance, this.pinchStart.distance),
        deltaCenterX: currentPinch.center.x - this.pinchStart.center.x,
        deltaCenterY: currentPinch.center.y - this.pinchStart.center.y,
        sourceEvent: event,
      });

      return true;
    }

    const point = this.pointerSession.firstPoint();

    if (!point) {
      return true;
    }

    const previousPoint = this.lastPanPoint ?? point.point;
    this.lastPanPoint = point.point;

    this.options.onGesture({
      type: "panMove",
      pointerId: point.pointerId,
      previousPoint,
      point: point.point,
      deltaX: point.point.x - previousPoint.x,
      deltaY: point.point.y - previousPoint.y,
      sourceEvent: event,
    });

    return true;
  }

  pointerUp(event: PointerEvent): boolean {
    if (!this.pointerSession.end(event)) {
      return false;
    }

    this.afterPointerEnded(event);
    return true;
  }

  pointerCancel(event: PointerEvent): void {
    this.pointerSession.cancel(event);
    this.afterPointerEnded(event);
  }

  wheel(event: WheelEvent): void {
    if (this.options.preventDefault ?? true) {
      event.preventDefault();
    }

    if (this.options.stopPropagation ?? false) {
      event.stopPropagation();
    }

    this.options.onGesture({
      type: "wheelZoom",
      point: this.options.wheelToPoint(event),
      deltaY: event.deltaY,
      factor: this.options.wheelZoomFactor?.(event) ?? wheelZoomFactor(event.deltaY),
      sourceEvent: event,
    });
  }

  cancel(): void {
    const hadPan = this.lastPanPoint !== null;
    const hadPinch = this.pinchStart !== null;

    this.pointerSession.clear();
    this.lastPanPoint = null;
    this.pinchStart = null;

    if (hadPinch) {
      this.options.onGesture({type: "pinchEnd"});
    }

    if (hadPan) {
      this.options.onGesture({type: "panEnd"});
    }
  }

  dispose(): void {
    this.cancel();
  }

  private afterPointerEnded(sourceEvent: PointerEvent): void {
    if (this.pointerSession.count() < 2 && this.pinchStart) {
      this.pinchStart = null;
      this.options.onGesture({type: "pinchEnd", sourceEvent});
    }

    const remainingPoint = this.pointerSession.firstPoint();

    if (remainingPoint) {
      this.lastPanPoint = remainingPoint.point;
      this.options.onGesture({
        type: "panStart",
        pointerId: remainingPoint.pointerId,
        point: remainingPoint.point,
        sourceEvent,
      });
      return;
    }

    if (this.lastPanPoint) {
      this.lastPanPoint = null;
      this.options.onGesture({type: "panEnd", sourceEvent});
    }
  }

  private currentPinchSnapshot(): PinchGestureSnapshot<TPoint> | null {
    const pair = this.pointerSession.twoPoints();

    if (!pair) {
      return null;
    }

    const [first, second] = pair;
    return {
      center: midpoint(first.point, second.point),
      distance: distance(first.point, second.point),
      pair: {first, second},
    };
  }
}

function midpoint<TPoint extends GesturePoint>(first: TPoint, second: TPoint): TPoint {
  return {
    ...first,
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function distance(first: GesturePoint, second: GesturePoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function safeScaleFactor(currentDistance: number, startDistance: number): number {
  if (startDistance <= 0) {
    return 1;
  }

  return currentDistance / startDistance;
}
