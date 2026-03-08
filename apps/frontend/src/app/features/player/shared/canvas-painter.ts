/**
 * Reusable canvas painting logic shared between avatar and draw canvases.
 */

/** Canvas internal resolution — always square */
export const CANVAS_RESOLUTION = 400;

export class CanvasPainter {
  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;

  constructor(
    private readonly getCanvas: () => HTMLCanvasElement | undefined,
    private readonly getColor: () => string,
    private readonly getBrushSize: () => number,
  ) {}

  public init(): boolean {
    const canvas = this.getCanvas();
    if (!canvas) return false;
    canvas.width = CANVAS_RESOLUTION;
    canvas.height = CANVAS_RESOLUTION;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
    }
    return true;
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
    const canvas = this.getCanvas();
    if (!canvas) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.isDrawing = true;

    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RESOLUTION / rect.width;
    this.lastPoint = {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
    };

    const ctx = canvas.getContext("2d");
    if (ctx && this.lastPoint) {
      ctx.fillStyle = this.getColor();
      ctx.beginPath();
      ctx.arc(this.lastPoint.x, this.lastPoint.y, this.getBrushSize() / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public pointerMove(event: PointerEvent): void {
    if (!this.isDrawing || !this.lastPoint) return;
    event.preventDefault();
    const canvas = this.getCanvas();
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RESOLUTION / rect.width;
    const currentX = (event.clientX - rect.left) * scale;
    const currentY = (event.clientY - rect.top) * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = this.getColor();
    ctx.lineWidth = this.getBrushSize();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
    this.lastPoint = { x: currentX, y: currentY };
  }

  public pointerUp(): void {
    this.isDrawing = false;
    this.lastPoint = null;
  }

  public toDataURL(): string | null {
    const canvas = this.getCanvas();
    return canvas ? canvas.toDataURL("image/png") : null;
  }
}

