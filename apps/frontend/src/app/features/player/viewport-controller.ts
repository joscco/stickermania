import { signal } from "@angular/core";
import type { Point, Size } from "./types";

export class ViewportController {
  public readonly scale = signal<number>(1.0);
  public readonly offsetX = signal<number>(0);
  public readonly offsetY = signal<number>(0);

  private readonly minScale: number;
  private readonly maxScale: number;

  private inertiaRafHandle: number | null = null;
  private panVelocityPxPerMs: Point = { x: 0, y: 0 };

  public constructor(args?: { minScale?: number; maxScale?: number }) {
    this.minScale = args?.minScale ?? 0.6;
    this.maxScale = args?.maxScale ?? 2.8;
  }

  public contentTransform(): string {
    return `translate(${this.offsetX()}px, ${this.offsetY()}px)`;
  }

  public stopInertia(): void {
    if (this.inertiaRafHandle === null) {
      return;
    }
    window.cancelAnimationFrame(this.inertiaRafHandle);
    this.inertiaRafHandle = null;
  }

  public setPanVelocityPxPerMs(velocity: Point): void {
    this.panVelocityPxPerMs = velocity;
  }

  public panBy(args: { deltaX: number; deltaY: number; viewportSize: Size; sceneSize: Size }): void {
    const nextOffsetX = this.offsetX() + args.deltaX;
    const nextOffsetY = this.offsetY() + args.deltaY;

    const clamped = this.clampOffsets({
      viewportSize: args.viewportSize,
      sceneSize: args.sceneSize,
      scale: this.scale(),
      offsetX: nextOffsetX,
      offsetY: nextOffsetY
    });

    this.offsetX.set(clamped.offsetX);
    this.offsetY.set(clamped.offsetY);
  }

  public center(args: { viewportSize: Size; sceneSize: Size }): void {
    const scale = this.scale();
    const centeredX = (args.viewportSize.width - args.sceneSize.width * scale) / 2;
    const centeredY = (args.viewportSize.height - args.sceneSize.height * scale) / 2;

    const clamped = this.clampOffsets({
      viewportSize: args.viewportSize,
      sceneSize: args.sceneSize,
      scale,
      offsetX: centeredX,
      offsetY: centeredY
    });

    this.offsetX.set(clamped.offsetX);
    this.offsetY.set(clamped.offsetY);
  }

  public zoomAtPoint(args: {
    viewportPoint: Point;
    factor: number;
    viewportSize: Size;
    sceneSize: Size;
  }): void {
    const previousScale = this.scale();
    const nextScale = this.clampScale(previousScale * args.factor);

    const contentPoint = this.viewportToContentPoint({
      viewportPoint: args.viewportPoint,
      currentScale: previousScale
    });

    const nextOffsetX = args.viewportPoint.x - contentPoint.x * nextScale;
    const nextOffsetY = args.viewportPoint.y - contentPoint.y * nextScale;

    const clamped = this.clampOffsets({
      viewportSize: args.viewportSize,
      sceneSize: args.sceneSize,
      scale: nextScale,
      offsetX: nextOffsetX,
      offsetY: nextOffsetY
    });

    this.scale.set(nextScale);
    this.offsetX.set(clamped.offsetX);
    this.offsetY.set(clamped.offsetY);
  }

  public viewportToContentPoint(args: { viewportPoint: Point; currentScale?: number }): Point {
    const currentScale = args.currentScale ?? this.scale();
    return {
      x: (args.viewportPoint.x - this.offsetX()) / currentScale,
      y: (args.viewportPoint.y - this.offsetY()) / currentScale
    };
  }

  public startInertia(args: { viewportSize: Size; sceneSize: Size }): void {
    const speed = Math.hypot(this.panVelocityPxPerMs.x, this.panVelocityPxPerMs.y);
    if (speed < 0.02) {
      return;
    }

    const decayPerFrame = 0.90;
    let lastT = performance.now();

    const tick = (t: number) => {
      const dt = Math.min(32, Math.max(8, t - lastT));
      lastT = t;

      const nextOffsetX = this.offsetX() + this.panVelocityPxPerMs.x * dt;
      const nextOffsetY = this.offsetY() + this.panVelocityPxPerMs.y * dt;

      const clamped = this.clampOffsets({
        viewportSize: args.viewportSize,
        sceneSize: args.sceneSize,
        scale: this.scale(),
        offsetX: nextOffsetX,
        offsetY: nextOffsetY
      });

      this.offsetX.set(clamped.offsetX);
      this.offsetY.set(clamped.offsetY);

      const hitEdgeX = clamped.offsetX !== nextOffsetX;
      const hitEdgeY = clamped.offsetY !== nextOffsetY;
      const edgeDamp = (hitEdgeX || hitEdgeY) ? 0.65 : 1.0;

      this.panVelocityPxPerMs = {
        x: this.panVelocityPxPerMs.x * decayPerFrame * edgeDamp,
        y: this.panVelocityPxPerMs.y * decayPerFrame * edgeDamp
      };

      const newSpeed = Math.hypot(this.panVelocityPxPerMs.x, this.panVelocityPxPerMs.y);
      if (newSpeed < 0.01) {
        this.inertiaRafHandle = null;
        return;
      }

      this.inertiaRafHandle = window.requestAnimationFrame(tick);
    };

    this.inertiaRafHandle = window.requestAnimationFrame(tick);
  }

  private clampScale(value: number): number {
    return Math.min(this.maxScale, Math.max(this.minScale, value));
  }

  private clampOffsets(args: {
    viewportSize: Size;
    sceneSize: Size;
    scale: number;
    offsetX: number;
    offsetY: number;
  }): { offsetX: number; offsetY: number } {
    const scaledWidth = args.sceneSize.width * args.scale;
    const scaledHeight = args.sceneSize.height * args.scale;

    let offsetX: number;
    if (scaledWidth <= args.viewportSize.width) {
      offsetX = (args.viewportSize.width - scaledWidth) / 2;
    } else {
      const minX = args.viewportSize.width - scaledWidth;
      const maxX = 0;
      offsetX = this.clampNumber(args.offsetX, minX, maxX);
    }

    let offsetY: number;
    if (scaledHeight <= args.viewportSize.height) {
      offsetY = (args.viewportSize.height - scaledHeight) / 2;
    } else {
      const minY = args.viewportSize.height - scaledHeight;
      const maxY = 0;
      offsetY = this.clampNumber(args.offsetY, minY, maxY);
    }

    return { offsetX, offsetY };
  }

  private clampNumber(value: number, min: number, max: number): number {
    if (value < min) {
      return min;
    }
    if (value > max) {
      return max;
    }
    return value;
  }
}
