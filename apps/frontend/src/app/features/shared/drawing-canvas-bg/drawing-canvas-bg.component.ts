import {AfterViewInit, Component, ElementRef, input, OnDestroy, output, signal, viewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import {CanvasPainter, CANVAS_RESOLUTION} from "../paint-canvas/canvas-painter";

/**
 * Drawing canvas with a background image that cannot be erased.
 * Background is rendered as a separate layer behind the drawing canvas.
 * On export, both layers are merged.
 */
@Component({
  selector: "app-drawing-canvas-bg",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./drawing-canvas-bg.component.html",
  host: {"style": "display: block"},
})
export class DrawingCanvasBgComponent implements AfterViewInit, OnDestroy {
  readonly baseImageUrl = input<string | null>(null);
  readonly submitted = output<string>();
  readonly cleared = output<void>();

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>("drawCanvas");
  readonly wrapperRef = viewChild<ElementRef<HTMLElement>>("wrapper");

  public readonly painter = new CanvasPainter(
    () => this.canvasRef()?.nativeElement,
    () => (this.drawMode() === "erase") ? "__erase__" : "#000000",
    () => (this.drawMode() === "erase" ? 20 : (this.drawMode() === "small" ? 5 : 10)),
  );

  drawMode = signal<"big" | "small" | "erase">("big");

  private lastTouchStart = 0;
  private guards: [EventTarget, string, (e: any) => void][] = [];

  ngAfterViewInit(): void {
    setTimeout(() => this.painter.init(), 50);

    const wrapper = this.wrapperRef()?.nativeElement;
    const canvas = this.canvasRef()?.nativeElement;

    this.guard(document, "gesturestart", this.blockAll);
    this.guard(document, "gesturechange", this.blockAll);
    this.guard(document, "gestureend", this.blockAll);
    this.guard(document, "dblclick", this.blockAll);
    this.guard(document, "contextmenu", this.blockAll);
    this.guard(document, "touchstart", this.blockDoubleTap);
    this.guard(document, "touchmove", this.blockMultiTouch);

    if (wrapper) this.guard(wrapper, "touchstart", this.blockMultiTouch);
    if (canvas) this.guard(canvas, "touchstart", this.blockDoubleTap);
  }

  ngOnDestroy(): void {
    for (const [t, e, h] of this.guards) t.removeEventListener(e, h);
    this.guards.length = 0;
  }

  private guard(t: EventTarget, e: string, h: (e: any) => void): void {
    t.addEventListener(e, h, {passive: false});
    this.guards.push([t, e, h]);
  }

  private blockAll = (e: Event): void => e.preventDefault();
  private blockMultiTouch = (e: TouchEvent): void => { if (e.touches.length > 1) e.preventDefault(); };
  private blockDoubleTap = (e: TouchEvent): void => {
    const now = Date.now();
    if (now - this.lastTouchStart < 500) e.preventDefault();
    this.lastTouchStart = now;
  };

  public setDrawMode(mode: "big" | "small" | "erase"): void { this.drawMode.set(mode); }

  public clear(): void { this.painter.clear(); this.cleared.emit(); }

  public submit(): void {
    const drawingUrl = this.painter.toDataURL();
    if (!drawingUrl) return;

    const bgUrl = this.baseImageUrl();
    if (!bgUrl) {
      this.submitted.emit(drawingUrl);
      return;
    }

    // Merge background + drawing
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const merged = document.createElement("canvas");
      merged.width = CANVAS_RESOLUTION;
      merged.height = CANVAS_RESOLUTION;
      const ctx = merged.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);

      const drawCanvas = this.canvasRef()?.nativeElement;
      if (drawCanvas) ctx.drawImage(drawCanvas, 0, 0);

      this.submitted.emit(merged.toDataURL("image/png"));
    };
    img.onerror = () => this.submitted.emit(drawingUrl);
    img.src = bgUrl;
  }
}
