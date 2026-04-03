import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  input,
  output,
  signal,
  OnDestroy,
} from "@angular/core";
import { CanvasPainter } from "./canvas-painter";

/**
 * Shared drawing canvas used by both avatar-drawing and prompt-drawing.
 *
 * Usage:
 *   <app-drawing-canvas
 *     [frameImageUrl]="'assets/png/draw_frame.png'"   ← optional overlay frame
 *     [canvasInset]="'11%'"                            ← how much to inset canvas inside frame
 *     (cleared)="..."
 *     (submitted)="onSubmit($event)"
 *   />
 */
@Component({
  selector: "app-drawing-canvas",
  standalone: true,
  templateUrl: "./drawing-canvas.component.html",
})
export class DrawingCanvasComponent implements AfterViewInit, OnDestroy {
  /** Optional frame image overlaid on top of the canvas */
  public readonly frameImageUrl = input<string | null>(null);

  /** Emits the data URL on submit */
  public readonly submitted = output<string>();
  /** Emits when cleared */
  public readonly cleared = output<void>();

  @ViewChild("drawCanvas") canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("wrapper") wrapperRef!: ElementRef<HTMLElement>;

  public readonly canvasInset = input<string>(11 + "%");
  public readonly brushThin = signal(true);
  public readonly eraserMode = signal(false);

  public readonly painter = new CanvasPainter(
    () => this.canvasRef?.nativeElement,
    () => (this.eraserMode() ? "#ffffff" : "#000000"),
    () => (this.eraserMode() ? 20 : this.brushThin() ? 5 : 10),
  );

  /** Computed content size so canvas fills the space inside the inset */
  public canvasContentSize(): string {
    const inset = this.canvasInset();
    if (inset === "0" || inset === "0%") return "100%";
    return `calc(100% - 2 * ${inset})`;
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.painter.init(), 50);

    // Prevent Safari pinch-zoom / magnifier gestures on the drawing area
    const wrapper = this.wrapperRef?.nativeElement;
    if (wrapper) {
      wrapper.addEventListener("gesturestart", this.preventGesture, { passive: false });
      wrapper.addEventListener("gesturechange", this.preventGesture, { passive: false });
      wrapper.addEventListener("gestureend", this.preventGesture, { passive: false });
      wrapper.addEventListener("touchstart", this.preventMultiTouch, { passive: false });
    }

    // Block ALL zoom/gesture defaults at document level while canvas is alive.
    // This catches double-tap-zoom, pinch-to-zoom, Safari magnifier, and
    // long-press context-menu that the per-wrapper handlers sometimes miss.
    document.addEventListener("gesturestart", this.preventGesture, { passive: false });
    document.addEventListener("gesturechange", this.preventGesture, { passive: false });
    document.addEventListener("gestureend", this.preventGesture, { passive: false });
    document.addEventListener("touchmove", this.preventPinchZoom, { passive: false });
    document.addEventListener("contextmenu", this.preventGesture);
  }

  ngOnDestroy(): void {
    const wrapper = this.wrapperRef?.nativeElement;
    if (wrapper) {
      wrapper.removeEventListener("gesturestart", this.preventGesture);
      wrapper.removeEventListener("gesturechange", this.preventGesture);
      wrapper.removeEventListener("gestureend", this.preventGesture);
      wrapper.removeEventListener("touchstart", this.preventMultiTouch);
    }

    document.removeEventListener("gesturestart", this.preventGesture);
    document.removeEventListener("gesturechange", this.preventGesture);
    document.removeEventListener("gestureend", this.preventGesture);
    document.removeEventListener("touchmove", this.preventPinchZoom);
    document.removeEventListener("contextmenu", this.preventGesture);
  }

  public preventGesture = (e: Event): void => {
    e.preventDefault();
  };

  public preventMultiTouch = (e: TouchEvent): void => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  };

  /** Block pinch-zoom (2+ finger touchmove) at the document level */
  public preventPinchZoom = (e: TouchEvent): void => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  };

  public selectThickBrush(): void {
    this.brushThin.set(false);
    this.eraserMode.set(false);
  }

  public selectThinBrush(): void {
    this.brushThin.set(true);
    this.eraserMode.set(false);
  }

  public selectEraser(): void {
    this.eraserMode.set(true);
  }

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

