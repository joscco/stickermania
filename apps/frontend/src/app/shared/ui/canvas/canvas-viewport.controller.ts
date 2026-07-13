export type CanvasPoint = {x: number; y: number};

export type ElementRefLike<TElement extends HTMLElement> = {
  nativeElement: TElement;
};

export type CanvasResizeEvent = {
  canvas: HTMLCanvasElement;
  previousWidth: number;
  previousHeight: number;
  width: number;
  height: number;
};

export type CanvasViewportControllerOptions = {
  redraw: () => void;
  fit?: () => void;
  onResize?: (event: CanvasResizeEvent) => void;
  pixelRatio?: () => number;
};

export class CanvasViewportController {
  private canvasFrame?: ElementRefLike<HTMLDivElement>;
  private sourceCanvas?: ElementRefLike<HTMLCanvasElement>;
  private resizeObserver: ResizeObserver | null = null;
  private renderFrameId: number | null = null;
  private fitOnNextRender = false;
  private pixelRatio = 1;

  constructor(private readonly options: CanvasViewportControllerOptions) {}

  setCanvasFrame(ref: ElementRefLike<HTMLDivElement> | undefined): void {
    this.canvasFrame = ref;
    this.observeCanvasFrame();
    this.scheduleRender();
  }

  setSourceCanvas(ref: ElementRefLike<HTMLCanvasElement> | undefined, fit = false): void {
    this.sourceCanvas = ref;
    this.scheduleRender(fit);
  }

  canvas(): HTMLCanvasElement | null {
    return this.sourceCanvas?.nativeElement ?? null;
  }

  canvasPixelRatio(): number {
    return this.pixelRatio;
  }

  canvasPoint(event: PointerEvent): CanvasPoint {
    return this.canvasPointFromClient(event.clientX, event.clientY);
  }

  canvasPointFromClient(clientX: number, clientY: number): CanvasPoint {
    const canvas = this.canvas();
    if (!canvas) {
      return {x: 0, y: 0};
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * canvas.width / Math.max(1, rect.width),
      y: (clientY - rect.top) * canvas.height / Math.max(1, rect.height),
    };
  }

  scheduleRender(fit = false): void {
    this.fitOnNextRender ||= fit;
    if (this.renderFrameId !== null) return;

    const render = () => {
      this.renderFrameId = null;
      this.resizeCanvasToFrame();

      const shouldFit = this.fitOnNextRender;
      this.fitOnNextRender = false;
      if (shouldFit && this.options.fit) {
        this.options.fit();
        return;
      }

      this.options.redraw();
    };

    if (typeof requestAnimationFrame === "undefined") {
      setTimeout(render, 0);
      return;
    }

    this.renderFrameId = requestAnimationFrame(render);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.renderFrameId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.renderFrameId);
    }
    this.renderFrameId = null;
  }

  private resizeCanvasToFrame(): void {
    const frame = this.canvasFrame?.nativeElement;
    const canvas = this.canvas();
    if (!frame || !canvas) return;

    const rect = frame.getBoundingClientRect();
    const pixelRatio = this.options.pixelRatio?.() ?? currentCanvasPixelRatio();
    this.pixelRatio = pixelRatio;

    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width === width && canvas.height === height) return;

    const previousWidth = canvas.width;
    const previousHeight = canvas.height;
    canvas.width = width;
    canvas.height = height;
    this.options.onResize?.({
      canvas,
      previousWidth,
      previousHeight,
      width,
      height,
    });
  }

  private observeCanvasFrame(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (typeof ResizeObserver === "undefined" || !this.canvasFrame) return;

    this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
    this.resizeObserver.observe(this.canvasFrame.nativeElement);
  }
}

export function currentCanvasPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
}
