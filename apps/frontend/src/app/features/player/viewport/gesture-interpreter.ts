import {Point} from '../types';

export interface GestureCallbacks {
  onPanStart?: () => void;
  onPan?: (delta: Point, velocityPxPerMs: Point) => void;
  onPanEnd?: (velocityPxPerMs: Point) => void;

  onPinchStart?: () => void;
  onPinch?: (centerClient: Point, factor: number, centerDeltaClient: Point) => void;
  onPinchEnd?: () => void;

  onTap?: (clientPoint: Point) => void;

  onWheelZoom?: (clientPoint: Point, factor: number) => void;
}

export class GestureInterpreter {
  private readonly callbacks: GestureCallbacks;

  private activePointers: Map<number, Point> = new Map();

  // pan
  private isPanning: boolean = false;
  private lastPanClient: Point | null = null;
  private lastPanTimestampMs: number = 0;
  private panVelocityPxPerMs: Point = { x: 0, y: 0 };

  // pinch (incremental + stable)
  private lastPinchDistance: number | null = null;
  private lastPinchCenterClient: Point | null = null;

  // If we ever pinched in the current interaction, we NEVER allow tap until all pointers are up.
  private didPinchDuringGesture: boolean = false;

  // tap detection
  private tapStartClient: Point | null = null;
  private tapMoved: boolean = false;
  private wasPinching: boolean = false;

  private tapStartTimeMs: number | null = null;
  private didApplyPanDuringGesture: boolean = false;
  private ignoreTapsUntilMs: number = 0;

  private readonly tapMaxDurationMs: number;
  private readonly tapMoveThresholdPx: number;

  public constructor(args: { callbacks: GestureCallbacks; tapMaxDurationMs?: number; tapMoveThresholdPx?: number }) {
    this.callbacks = args.callbacks;
    this.tapMaxDurationMs = args.tapMaxDurationMs ?? 260;
    this.tapMoveThresholdPx = args.tapMoveThresholdPx ?? 14;
  }

  public onPointerDown(event: PointerEvent): void {
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const nowMs = performance.now();
    const canArmTap = nowMs >= this.ignoreTapsUntilMs;

    if (this.activePointers.size === 1) {
      this.isPanning = true;

      this.lastPanClient = { x: event.clientX, y: event.clientY };
      this.lastPanTimestampMs = performance.now();
      this.panVelocityPxPerMs = { x: 0, y: 0 };

      this.lastPinchDistance = null;
      this.lastPinchCenterClient = null;

      if (canArmTap && !this.didPinchDuringGesture) {
        this.tapStartClient = { x: event.clientX, y: event.clientY };
        this.tapMoved = false;
        this.tapStartTimeMs = performance.now();
        this.didApplyPanDuringGesture = false;
      } else {
        this.tapStartClient = null;
        this.tapMoved = true;
        this.tapStartTimeMs = null;
        this.didApplyPanDuringGesture = true;
      }

      this.wasPinching = false;

      if (this.callbacks.onPanStart) {
        this.callbacks.onPanStart();
      }
      return;
    }

    if (this.activePointers.size === 2) {
      const [firstPointer, secondPointer] = Array.from(this.activePointers.values());

      this.lastPinchDistance = this.distance(firstPointer, secondPointer);
      this.lastPinchCenterClient = {
        x: (firstPointer.x + secondPointer.x) / 2,
        y: (firstPointer.y + secondPointer.y) / 2
      };

      this.didPinchDuringGesture = true;
      this.isPanning = false;
      this.wasPinching = true;

      this.tapStartClient = null;
      this.tapMoved = true;
      this.tapStartTimeMs = null;
      this.didApplyPanDuringGesture = true;

      this.ignoreTapsUntilMs = performance.now() + 260;

      if (this.callbacks.onPinchStart) {
        this.callbacks.onPinchStart();
      }
    }
  }

  public onPointerMove(event: PointerEvent): void {
    if (!this.activePointers.has(event.pointerId)) {
      return;
    }

    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.tapStartClient) {
      const dx = event.clientX - this.tapStartClient.x;
      const dy = event.clientY - this.tapStartClient.y;
      if (Math.hypot(dx, dy) > this.tapMoveThresholdPx) {
        this.tapMoved = true;
      }
    }

    // Pinch: zoom + two-finger pan via center delta
    if (this.activePointers.size === 2 && this.lastPinchDistance && this.lastPinchCenterClient) {
      const [firstPointer, secondPointer] = Array.from(this.activePointers.values());
      const newDistance = this.distance(firstPointer, secondPointer);

      let factor = newDistance / this.lastPinchDistance;
      factor = Math.min(1.04, Math.max(0.96, factor));

      const newCenterClient: Point = {
        x: (firstPointer.x + secondPointer.x) / 2,
        y: (firstPointer.y + secondPointer.y) / 2
      };

      const centerDeltaClient: Point = {
        x: newCenterClient.x - this.lastPinchCenterClient.x,
        y: newCenterClient.y - this.lastPinchCenterClient.y
      };

      this.lastPinchDistance = newDistance;
      this.lastPinchCenterClient = newCenterClient;

      this.didPinchDuringGesture = true;

      if (this.callbacks.onPinch) {
        this.callbacks.onPinch(newCenterClient, factor, centerDeltaClient);
      }

      this.panVelocityPxPerMs = { x: 0, y: 0 };
      return;
    }

    // Pan
    if (!this.isPanning || !this.lastPanClient) {
      return;
    }

    const nowT = performance.now();
    const dt = Math.max(8, nowT - this.lastPanTimestampMs);

    const dx = event.clientX - this.lastPanClient.x;
    const dy = event.clientY - this.lastPanClient.y;

    this.lastPanClient = { x: event.clientX, y: event.clientY };
    this.lastPanTimestampMs = nowT;

    const vx = dx / dt;
    const vy = dy / dt;
    const alpha = 0.25;

    this.panVelocityPxPerMs = {
      x: this.panVelocityPxPerMs.x * (1 - alpha) + vx * alpha,
      y: this.panVelocityPxPerMs.y * (1 - alpha) + vy * alpha
    };

    this.didApplyPanDuringGesture = true;

    if (this.callbacks.onPan) {
      this.callbacks.onPan({ x: dx, y: dy }, this.panVelocityPxPerMs);
    }
  }

  public onPointerUp(event: PointerEvent): void {
    const wasActive = this.activePointers.has(event.pointerId);
    this.activePointers.delete(event.pointerId);

    const nowMs = performance.now();
    const tapDurationOk = this.tapStartTimeMs !== null && (nowMs - this.tapStartTimeMs) <= this.tapMaxDurationMs;
    const cooldownOk = nowMs >= this.ignoreTapsUntilMs;

    const isTap =
      wasActive &&
      cooldownOk &&
      tapDurationOk &&
      !this.wasPinching &&
      !this.didPinchDuringGesture &&
      !this.tapMoved &&
      !this.didApplyPanDuringGesture &&
      this.activePointers.size === 0;

    if (isTap) {
      if (this.callbacks.onTap) {
        this.callbacks.onTap({ x: event.clientX, y: event.clientY });
      }
    }

    if (this.activePointers.size === 0) {
      const endedAfterPinch = this.wasPinching || this.didPinchDuringGesture;

      this.isPanning = false;
      this.lastPanClient = null;

      this.lastPinchDistance = null;
      this.lastPinchCenterClient = null;

      this.tapStartClient = null;
      this.tapMoved = false;
      this.wasPinching = false;

      if (endedAfterPinch) {
        this.ignoreTapsUntilMs = performance.now() + 360;
        if (this.callbacks.onPinchEnd) {
          this.callbacks.onPinchEnd();
        }
      } else {
        if (this.callbacks.onPanEnd) {
          this.callbacks.onPanEnd(this.panVelocityPxPerMs);
        }
      }

      this.tapStartTimeMs = null;
      this.didApplyPanDuringGesture = false;
      this.didPinchDuringGesture = false;
      return;
    }

    // 2 -> 1 after pinch: keep it "dead" to avoid accidental taps/places
    if (this.activePointers.size === 1 && this.didPinchDuringGesture) {
      this.isPanning = false;
      this.lastPanClient = null;

      this.wasPinching = true;
      this.lastPinchDistance = null;
      this.lastPinchCenterClient = null;

      this.tapStartClient = null;
      this.tapMoved = true;
      this.tapStartTimeMs = null;
      this.didApplyPanDuringGesture = true;

      this.ignoreTapsUntilMs = performance.now() + 360;
      return;
    }

    if (this.activePointers.size === 1) {
      const remaining = Array.from(this.activePointers.values())[0];

      this.isPanning = true;
      this.lastPanClient = { x: remaining.x, y: remaining.y };
      this.lastPanTimestampMs = performance.now();
      this.panVelocityPxPerMs = { x: 0, y: 0 };

      this.lastPinchDistance = null;
      this.lastPinchCenterClient = null;

      this.wasPinching = false;

      this.tapStartClient = { x: remaining.x, y: remaining.y };
      this.tapMoved = false;

      this.tapStartTimeMs = performance.now();
      this.didApplyPanDuringGesture = false;
    }
  }

  public onWheel(event: WheelEvent): void {
    const factor = event.deltaY > 0 ? 0.95 : 1.05;
    if (this.callbacks.onWheelZoom) {
      this.callbacks.onWheelZoom({ x: event.clientX, y: event.clientY }, factor);
    }
  }

  private distance(firstPoint: Point, secondPoint: Point): number {
    const dx = firstPoint.x - secondPoint.x;
    const dy = firstPoint.y - secondPoint.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
