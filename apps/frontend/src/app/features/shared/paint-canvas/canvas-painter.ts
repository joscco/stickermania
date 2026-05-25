/**
 * Reusable canvas painting logic shared between avatar and draw canvases.
 */

export const CANVAS_RESOLUTION = 400;

export class CanvasPainter {
  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  private activePointerId: number | null = null;

  constructor(
    private readonly getCanvas: () => HTMLCanvasElement | undefined,
    private readonly getColor: () => string,
    private readonly getBrushSize: () => number,
    private readonly isErasing?: () => boolean,
  ) {}

  public init(transparent = false): boolean {
    const canvas = this.getCanvas();
    if (!canvas) return false;
    canvas.width = CANVAS_RESOLUTION;
    canvas.height = CANVAS_RESOLUTION;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (!transparent) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
      } else {
        ctx.clearRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
      }
    }
    return true;
  }

  /** Load an image (data-URL or http URL) onto the canvas as starting content. */
  public loadImage(src: string): void {
    const canvas = this.getCanvas();
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
      ctx.drawImage(img, 0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
    };
    img.src = src;
  }

  public clear(): void {
    const canvas = this.getCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  public pointerDown(event: PointerEvent): void {
    event.preventDefault();
    if (this.isDrawing) return;

    const canvas = this.getCanvas();
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    this.isDrawing = true;
    this.activePointerId = event.pointerId;

    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RESOLUTION / rect.width;
    this.lastPoint = {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
    };

    const ctx = canvas.getContext("2d");
    if (ctx && this.lastPoint) {
      if (this.isErasing?.()) {
        ctx.globalCompositeOperation = "destination-out";
      }
      ctx.fillStyle = this.isErasing?.() ? "black" : this.getColor();
      ctx.beginPath();
      ctx.arc(this.lastPoint.x, this.lastPoint.y, this.getBrushSize() / 2, 0, Math.PI * 2);
      ctx.fill();
      if (this.isErasing?.()) {
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }

  public pointerMove(event: PointerEvent): void {
    if (!this.isDrawing || !this.lastPoint) return;
    event.preventDefault();
    if (event.pointerId !== this.activePointerId) return;
    const canvas = this.getCanvas();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RESOLUTION / rect.width;
    const currentX = (event.clientX - rect.left) * scale;
    const currentY = (event.clientY - rect.top) * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (this.isErasing?.()) {
      ctx.globalCompositeOperation = "destination-out";
    }
    ctx.strokeStyle = this.isErasing?.() ? "black" : this.getColor();
    ctx.lineWidth = this.getBrushSize();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
    if (this.isErasing?.()) {
      ctx.globalCompositeOperation = "source-over";
    }
    this.lastPoint = { x: currentX, y: currentY };
  }

  public pointerUp(event: PointerEvent): void {
    // Only end the stroke when the original finger lifts
    if (event.pointerId !== this.activePointerId) return;
    this.isDrawing = false;
    this.lastPoint = null;
    this.activePointerId = null;
  }

  public toDataURL(): string | null {
    const canvas = this.getCanvas();
    return canvas ? canvas.toDataURL("image/png") : null;
  }
}

