import {AfterViewInit, Component, ElementRef, input, OnDestroy, output, signal, ViewChild,} from "@angular/core";
import {CanvasPainter} from "./canvas-painter";
import {SvgComponent} from "../svg/svg.component";

/** Size of frame overlay images (px) */
const FRAME_SIZE = 4123;
/** Size of the actual drawing area within the frame (px) */
const CANVAS_SIZE = 3416;

@Component({
  selector: "app-drawing-canvas",
  standalone: true,
  templateUrl: "./drawing-canvas.component.html",
  imports: [SvgComponent],
  host: {"style": "display: block"}
})
export class DrawingCanvasComponent implements AfterViewInit, OnDestroy {
  public readonly submitted = output<string>();
  public readonly cleared = output<void>();

  /** Optional image (data-URL or http URL) to pre-populate the canvas with. */
  public readonly initialImage = input<string | null>(null);

  @ViewChild("drawCanvas") canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("wrapper") wrapperRef!: ElementRef<HTMLElement>;

  public readonly painter = new CanvasPainter(
    () => this.canvasRef?.nativeElement,
    () => "#000000",
    () => (this.drawMode() == 'erase' ? 20 : ((this.drawMode() == "small") ? 5 : 10)),
    () => this.drawMode() == 'erase',
  );

  public readonly canvasSizePercent = `${((CANVAS_SIZE / FRAME_SIZE) * 100).toFixed(3)}%`;

  // ─── Safari iOS gesture suppression ─────────────────────────
  //
  // There is no single kill-switch. Safari's magnifier (UIKit),
  // pinch-zoom (viewport), double-tap-zoom, and context-menu are
  // four independent subsystems. CSS `touch-action: none` does NOT
  // fully suppress all of them — we must intercept at the event
  // level with { passive: false }.
  //
  // Three handlers cover everything:
  //   blockAll         → gesture*, dblclick, contextmenu
  //   blockMultiTouch  → touchstart/touchmove with 2+ fingers
  //   blockDoubleTap   → touchstart within 500ms of the last one
  //                      (kills magnifier + double-tap-zoom)

  private lastTouchStart = 0;

  private blockAll = (e: Event): void => e.preventDefault();

  private blockMultiTouch = (e: TouchEvent): void => {
    if (e.touches.length > 1) e.preventDefault();
  };

  private blockDoubleTap = (e: TouchEvent): void => {
    const now = Date.now();
    if (now - this.lastTouchStart < 500) e.preventDefault();
    this.lastTouchStart = now;
  };

  /** Registry for bulk cleanup in ngOnDestroy */
  private readonly guards: [EventTarget, string, (e: any) => void][] = [];

  private guard(target: EventTarget, event: string, handler: (e: any) => void): void {
    target.addEventListener(event, handler, {passive: false});
    this.guards.push([target, event, handler]);
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.painter.init();
      const img = this.initialImage();
      if (img) {
        this.painter.loadImage(img);
      }
    }, 50);

    const wrapper = this.wrapperRef?.nativeElement;
    const canvas = this.canvasRef?.nativeElement;

    // Document-level: active while the canvas component is alive
    for (const evt of ["gesturestart", "gesturechange", "gestureend", "dblclick", "contextmenu"]) {
      this.guard(document, evt, this.blockAll);
    }
    this.guard(document, "touchstart", this.blockDoubleTap);
    this.guard(document, "touchmove", this.blockMultiTouch);

    // Wrapper: extra multi-touch guard
    if (wrapper) {
      this.guard(wrapper, "touchstart", this.blockMultiTouch);
    }

    // Canvas: extra double-tap guard (closest to the source)
    if (canvas) {
      this.guard(canvas, "touchstart", this.blockDoubleTap);
    }
  }

  ngOnDestroy(): void {
    for (const [target, event, handler] of this.guards) {
      target.removeEventListener(event, handler);
    }
    this.guards.length = 0;
  }

  // ─── Brush controls ─────────────────────────────────────────
  drawMode = input<"big" | "small" | "erase">("big");

  public clear(): void {
    this.painter.clear();
    this.cleared.emit();
  }

  public submit(): void {
    const dataUrl = this.painter.toDataURL();
    if (dataUrl) {
      this.submitted.emit(dataUrl);
    }
  }
}

