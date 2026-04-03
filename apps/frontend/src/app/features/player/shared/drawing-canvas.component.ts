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
  template: `
    <div #wrapper class="relative overflow-hidden no-select bg-white"
         style="width: min(95vw, calc(100dvh - 260px)); aspect-ratio: 1; touch-action: manipulation;">

      @if (frameImageUrl()) {
        <img [src]="frameImageUrl()" class="absolute inset-0 w-full h-full pointer-events-none z-20" alt=""
             draggable="false"/>
        <canvas #drawCanvas class="absolute z-10" style="touch-action: none;"
                [style.inset]="canvasInset()"
                [style.width]="canvasContentSize()"
                [style.height]="canvasContentSize()"
                (pointerdown)="painter.pointerDown($event)"
                (pointermove)="painter.pointerMove($event)"
                (pointerup)="painter.pointerUp()"
                (pointercancel)="painter.pointerUp()"
        ></canvas>
      } @else {
        <canvas #drawCanvas class="w-full h-full rounded-2xl border-2 border-black/6" style="touch-action: none;"
                (pointerdown)="painter.pointerDown($event)"
                (pointermove)="painter.pointerMove($event)"
                (pointerup)="painter.pointerUp()"
                (pointercancel)="painter.pointerUp()"
        ></canvas>
      }
    </div>

    <!-- Tool bar -->
    <div class="flex items-center justify-center gap-3 mt-3">
      <button class="w-12 h-12 rounded-xl transition-transform"
              [class.scale-110]="brushThin() && !eraserMode()"
              (click)="selectThinBrush()">
        <img src="assets/png/draw_button_small.png" class="w-full h-full object-contain" alt="Dünn"/>
      </button>
      <button class="w-12 h-12 rounded-xl transition-transform"
              [class.scale-110]="!brushThin() && !eraserMode()"
              (click)="selectThickBrush()">
        <img src="assets/png/draw_button_big.png" class="w-full h-full object-contain" alt="Dick"/>
      </button>
      <button class="w-12 h-12 rounded-xl transition-transform"
              [class.scale-110]="eraserMode()"
              (click)="selectEraser()">
        <img src="assets/png/draw_button_eraser.png" class="w-full h-full object-contain" alt="Radierer"/>
      </button>
    </div>
  `,
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

