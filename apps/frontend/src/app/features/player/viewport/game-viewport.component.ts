import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  input,
  output,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import {GestureInterpreter} from './gesture-interpreter';
import {Point, Size} from '../types';
import {ViewportController} from './viewport-controller';

/**
 * A generic pan/zoom viewport that emits tap events in content (logical) coordinates.
 *
 * Usage:
 * ```html
 * <app-game-viewport
 *   [sceneWidth]="2000"
 *   [sceneHeight]="1400"
 *   (contentTapped)="onTap($event)">
 *   <!-- place your scene content here (absolute-positioned children) -->
 *   <ng-content />
 * </app-game-viewport>
 * ```
 */
@Component({
  selector: "app-game-viewport",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./game-viewport.component.html",
})
export class GameViewportComponent implements AfterViewInit, OnDestroy {
  public readonly sceneWidth = input.required<number>();
  public readonly sceneHeight = input.required<number>();

  /** Emits a tap in content (logical scene) coordinates. */
  public readonly contentTapped = output<Point>();

  @ViewChild("viewport") private viewportRef!: ElementRef<HTMLElement>;

  private readonly destroyRef = inject(DestroyRef);

  public readonly viewportCtrl = new ViewportController({
    minScale: 0.3,
    maxScale: 1.2,
    overscrollPx: 100,
  });

  private readonly gesture = new GestureInterpreter({
    callbacks: {
      onPan: (delta) => this.onPan(delta),
      onPanEnd: (velocity) => this.onPanEnd(velocity),
      onPinch: (center, factor, centerDelta) => this.onPinch(center, factor, centerDelta),
      onTap: (clientPoint) => this.handleTap(clientPoint),
      onWheelZoom: (clientPoint, factor) => this.handleWheelZoom(clientPoint, factor),
    },
    tapMaxDurationMs: 300,
    tapMoveThresholdPx: 12,
  });

  private removeMobileTouchHandlers: (() => void) | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────

  public ngAfterViewInit(): void {
    setTimeout(() => this.centerViewport(), 60);
    this.installMobileTouchHandlers();
    this.destroyRef.onDestroy(() => {
      this.viewportCtrl.stopInertia();
      if (this.removeMobileTouchHandlers) this.removeMobileTouchHandlers();
    });
  }

  public ngOnDestroy(): void {
    this.viewportCtrl.stopInertia();
    if (this.removeMobileTouchHandlers) this.removeMobileTouchHandlers();
  }

  /** Center the scene in the viewport. */
  public centerViewport(): void {
    if (!this.viewportRef) return;
    this.viewportCtrl.fitAndCenter({
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  public contentTransform(): string {
    return this.viewportCtrl.contentTransform();
  }

  // ── Tap → content coordinate ──────────────────────────────────

  private handleTap(clientPoint: Point): void {
    if (!this.viewportRef) return;
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const viewportPoint: Point = {
      x: clientPoint.x - rect.left,
      y: clientPoint.y - rect.top,
    };
    const contentPoint = this.viewportCtrl.viewportToContentPoint({ viewportPoint });
    this.contentTapped.emit(contentPoint);
  }

  // ── Pointer / wheel ───────────────────────────────────────────

  public onPointerDown(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this.viewportCtrl.stopInertia();
    this.viewportRef.nativeElement.setPointerCapture(e.pointerId);
    this.gesture.onPointerDown(e);
  }

  public onPointerMove(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this.gesture.onPointerMove(e);
  }

  public onPointerUp(e: PointerEvent): void {
    if (e.pointerType === "touch") return;
    this.gesture.onPointerUp(e);
  }

  public onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.viewportCtrl.stopInertia();
    if (e.ctrlKey || e.metaKey) {
      this.gesture.onWheel(e);
      return;
    }
    this.viewportCtrl.panBy({
      deltaX: -(e.deltaX || 0),
      deltaY: -(e.deltaY || 0),
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  // ── Gesture callbacks ─────────────────────────────────────────

  private onPan(delta: Point): void {
    this.viewportCtrl.panBy({
      deltaX: delta.x,
      deltaY: delta.y,
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  private onPanEnd(velocity: Point): void {
    this.viewportCtrl.setPanVelocityPxPerMs(velocity);
    this.viewportCtrl.startInertia({
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  private onPinch(center: Point, factor: number, centerDelta: Point): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const vs: Size = { width: rect.width, height: rect.height };
    this.viewportCtrl.panBy({ deltaX: centerDelta.x, deltaY: centerDelta.y, viewportSize: vs, sceneSize: this.sceneSize() });
    this.viewportCtrl.zoomAtPoint({
      viewportPoint: { x: center.x - rect.left, y: center.y - rect.top },
      factor, viewportSize: vs, sceneSize: this.sceneSize(),
    });
  }

  private handleWheelZoom(clientPoint: Point, factor: number): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    this.viewportCtrl.zoomAtPoint({
      viewportPoint: { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top },
      factor,
      viewportSize: { width: rect.width, height: rect.height },
      sceneSize: this.sceneSize(),
    });
  }

  // ── Mobile touch ──────────────────────────────────────────────

  private installMobileTouchHandlers(): void {
    const el = this.viewportRef?.nativeElement;
    if (!el) return;

    const toFake = (t: Touch) =>
      ({ pointerId: t.identifier, clientX: t.clientX, clientY: t.clientY }) as unknown as PointerEvent;

    const down = (ev: TouchEvent) => {
      this.viewportCtrl.stopInertia();
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) this.gesture.onPointerDown(toFake(t));
    };
    const move = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) this.gesture.onPointerMove(toFake(t));
    };
    const up = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) this.gesture.onPointerUp(toFake(t));
    };

    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up, { passive: false });
    el.addEventListener("touchcancel", up, { passive: false });

    this.removeMobileTouchHandlers = () => {
      el.removeEventListener("touchstart", down as EventListener);
      el.removeEventListener("touchmove", move as EventListener);
      el.removeEventListener("touchend", up as EventListener);
      el.removeEventListener("touchcancel", up as EventListener);
    };
  }

  // ── Helpers ───────────────────────────────────────────────────

  private sceneSize(): Size {
    return { width: this.sceneWidth(), height: this.sceneHeight() };
  }

  private getViewportSize(): Size {
    if (!this.viewportRef) {
      return { width: 400, height: 400 };
    }
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}

