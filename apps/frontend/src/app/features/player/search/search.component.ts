import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
} from "@angular/core";
import { CommonModule } from "@angular/common";

import { AudioService } from "../../../core/audio.service";
import { WorldStore } from "../../../core/world.store";
import { SceneRendererComponent } from "../../../shared/scene-renderer/scene-renderer.component";
import { ViewportController } from "../viewport-controller";
import { GestureInterpreter } from "../gesture-interpreter";
import type { Point, Size } from "../types";
import { SearchStore } from "./search.store";

/**
 * Self-contained search-mode component.
 *
 * Responsibilities:
 *  – render the pannable/zoomable scene with a viewfinder overlay
 *  – handle all pointer / touch / wheel gestures for navigation
 *  – delegate snapshot logic & feedback state to `SearchStore`
 *
 * Usage:
 * ```html
 * <app-search
 *   [sceneWidthPx]="sceneWidthPx()"
 *   [sceneHeightPx]="sceneHeightPx()"
 *   [timeLeft]="timeLeft()"
 * />
 * ```
 */
@Component({
  selector: "app-search",
  standalone: true,
  imports: [CommonModule, SceneRendererComponent],
  providers: [SearchStore],
  templateUrl: "./search.component.html",
})
export class SearchComponent implements AfterViewInit, OnDestroy {
  // ─── Inputs ────────────────────────────────────────────────────────

  /** Scene width in px (from game config). */
  public readonly sceneWidthPx = input<number>(1000);
  /** Scene height in px (from game config). */
  public readonly sceneHeightPx = input<number>(1000);
  /** Formatted countdown string, e.g. "1:23". */
  public readonly timeLeft = input<string>("");

  // ─── Injected services ─────────────────────────────────────────────

  public readonly searchStore = inject(SearchStore);
  public readonly world = inject(WorldStore);
  private readonly audio = inject(AudioService);
  private readonly destroyRef = inject(DestroyRef);

  // ─── ViewChild ─────────────────────────────────────────────────────

  @ViewChild("viewport") private viewportRef!: ElementRef<HTMLElement>;

  // ─── Viewport / Gesture state ──────────────────────────────────────

  public readonly viewportCtrl = new ViewportController({
    minScale: 0.28,
    maxScale: 3.0,
    overscrollPx: 50,
  });

  private readonly gesture = new GestureInterpreter({
    callbacks: {
      onPan: (delta) => this.onPan(delta),
      onPanEnd: (velocity) => this.onPanEnd(velocity),
      onPinch: (center, factor, centerDelta) =>
        this.onPinch(center, factor, centerDelta),
      onTap: () => {},
      onWheelZoom: (clientPoint, factor) =>
        this.onWheelZoom(clientPoint, factor),
    },
    tapMaxDurationMs: 260,
    tapMoveThresholdPx: 14,
  });

  private removeMobileTouchHandlers: (() => void) | null = null;

  // ─── Computed ──────────────────────────────────────────────────────

  private readonly sceneSize = computed<Size>(() => ({
    width: this.sceneWidthPx(),
    height: this.sceneHeightPx(),
  }));

  /** Pixel size of the circular scene container (logical field × zoom). */
  public readonly searchContainerSizePx = computed(() =>
    this.sceneWidthPx() * this.viewportCtrl.scale(),
  );

  /** Pixel size of each drawing on screen (config image size × zoom). */
  public readonly searchImageSizePx = computed(() =>
    this.world.imageSizePx() * this.viewportCtrl.scale(),
  );


  // ─── Lifecycle ─────────────────────────────────────────────────────

  public ngAfterViewInit(): void {

    // Center the viewport when the component first appears
    setTimeout(() => this.centerViewport(), 60);

    // Install non-passive touch handlers for reliable mobile panning
    this.installMobileTouchHandlers();

    this.destroyRef.onDestroy(() => {
      this.viewportCtrl.stopInertia();
      if (this.removeMobileTouchHandlers) this.removeMobileTouchHandlers();
    });
  }

  public ngOnDestroy(): void {
    // Cleanup handled via destroyRef for safety; belt-and-suspenders:
    this.viewportCtrl.stopInertia();
    if (this.removeMobileTouchHandlers) this.removeMobileTouchHandlers();
  }

  // ─── Public API ────────────────────────────────────────────────────

  /** Center the scene in the viewport. Can be called from outside via ViewChild. */
  public centerViewport(): void {
    if (!this.viewportRef) return;
    this.viewportCtrl.fitAndCenter({
      viewportSize: this.getViewportSize(),
      sceneSize: this.sceneSize(),
    });
  }

  /** CSS transform for the scrollable content layer. */
  public contentTransform(): string {
    return this.viewportCtrl.contentTransform();
  }

  /** Take a search snapshot – delegates to the SearchStore. */
  public takeSnapshot(): void {
    if (!this.viewportRef) return;

    const vpRect = this.viewportRef.nativeElement.getBoundingClientRect();
    const scale = this.viewportCtrl.scale();
    const viewfinderRadiusPx = Math.min(vpRect.width, vpRect.height) * 0.25;

    const contentCenter = this.viewportCtrl.viewportToContentPoint({
      viewportPoint: { x: vpRect.width / 2, y: vpRect.height / 2 },
    });

    this.searchStore.takeSnapshot({
      centerContentX: contentCenter.x,
      centerContentY: contentCenter.y,
      radiusContent: viewfinderRadiusPx / scale,
      sceneWidth: this.sceneWidthPx(),
      sceneHeight: this.sceneHeightPx(),
    });
  }

  // ─── Pointer / wheel event handlers (bound from template) ─────────

  public onPointerDown(e: PointerEvent): void {
    // On mobile we have explicit touch handlers (non-passive + preventDefault).
    // Avoid double-processing when the browser emits both TouchEvents and PointerEvents.
    if (e.pointerType === "touch") return;
    this.audio.unlockIfNeeded();
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

    // Ctrl/Meta + scroll = zoom; plain scroll = pan (trackpad convention)
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

  // ─── Gesture callbacks ─────────────────────────────────────────────

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

    this.viewportCtrl.panBy({
      deltaX: centerDelta.x,
      deltaY: centerDelta.y,
      viewportSize: vs,
      sceneSize: this.sceneSize(),
    });

    this.viewportCtrl.zoomAtPoint({
      viewportPoint: { x: center.x - rect.left, y: center.y - rect.top },
      factor,
      viewportSize: vs,
      sceneSize: this.sceneSize(),
    });
  }

  private onWheelZoom(clientPoint: Point, factor: number): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    this.viewportCtrl.zoomAtPoint({
      viewportPoint: { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top },
      factor,
      viewportSize: { width: rect.width, height: rect.height },
      sceneSize: this.sceneSize(),
    });
  }

  // ─── Mobile touch handlers ─────────────────────────────────────────

  /**
   * Installs non-passive touch event listeners to prevent iOS rubber-banding
   * and ensure consistent pan/pinch on mobile.
   */
  private installMobileTouchHandlers(): void {
    const el = this.viewportRef?.nativeElement;
    if (!el) return;

    const toFakePointerEvent = (t: Touch) =>
      ({
        pointerId: t.identifier,
        clientX: t.clientX,
        clientY: t.clientY,
      }) as unknown as PointerEvent;

    const down = (ev: TouchEvent) => {
      this.audio.unlockIfNeeded();
      this.viewportCtrl.stopInertia();
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) {
        this.gesture.onPointerDown(toFakePointerEvent(t));
      }
    };

    const move = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) {
        this.gesture.onPointerMove(toFakePointerEvent(t));
      }
    };

    const up = (ev: TouchEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      for (const t of Array.from(ev.changedTouches)) {
        this.gesture.onPointerUp(toFakePointerEvent(t));
      }
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

  // ─── Helpers ───────────────────────────────────────────────────────

  private getViewportSize(): Size {
    if (!this.viewportRef) return { width: 400, height: 400 };
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}

