import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import {capturePointer, releasePointer} from "../../../../shared/input/pointer-event-utils";
import {STICKERMANIA_COLORS} from "../../../../shared/theme/stickermania-theme";

export const AVATAR_CANVAS_RESOLUTION = STICKERMANIA_CONFIG.drawingCanvas.resolutionPx;

export class AvatarCanvasPainter {
  private isDrawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  private activePointerId: number | null = null;

  constructor(
    private readonly getCanvas: () => HTMLCanvasElement | undefined,
    private readonly getColor: () => string,
    private readonly getBrushSize: () => number,
  ) {}

  public init(): boolean {
    const canvas = this.getCanvas();
    if (!canvas) return false;
    canvas.width = AVATAR_CANVAS_RESOLUTION;
    canvas.height = AVATAR_CANVAS_RESOLUTION;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = STICKERMANIA_COLORS.white;
      ctx.fillRect(0, 0, AVATAR_CANVAS_RESOLUTION, AVATAR_CANVAS_RESOLUTION);
    }
    return true;
  }

  public loadImage(src: string): void {
    this.loadImageWithMode(src, true);
  }

  public clear(): void {
    const canvas = this.getCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = STICKERMANIA_COLORS.white;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  public pointerDown(event: PointerEvent): boolean {
    if (event.pointerType === "mouse" && event.button !== 0) return false;
    event.preventDefault();
    if (this.isDrawing) return false;

    const canvas = this.getCanvas();
    if (!canvas) return false;
    capturePointer(canvas, event.pointerId);
    this.isDrawing = true;
    this.activePointerId = event.pointerId;
    this.lastPoint = this.pointFromEvent(event, canvas);

    const ctx = canvas.getContext("2d");
    if (ctx && this.lastPoint) {
      ctx.fillStyle = this.getColor();
      ctx.beginPath();
      ctx.arc(this.lastPoint.x, this.lastPoint.y, this.getBrushSize() / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    return true;
  }

  public pointerMove(event: PointerEvent): void {
    if (!this.isDrawing || !this.lastPoint) return;
    event.preventDefault();
    if (event.pointerId !== this.activePointerId) return;
    const canvas = this.getCanvas();
    if (!canvas) return;

    const currentPoint = this.pointFromEvent(event, canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = this.getColor();
    ctx.lineWidth = this.getBrushSize();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.lastPoint.x, this.lastPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
    this.lastPoint = currentPoint;
  }

  public pointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) return;
    event.preventDefault();
    const canvas = this.getCanvas();
    if (canvas) {
      releasePointer(canvas, event.pointerId);
    }
    this.isDrawing = false;
    this.lastPoint = null;
    this.activePointerId = null;
  }

  public toDataURL(): string | null {
    const canvas = this.getCanvas();
    if (!canvas) return null;
    try {
      return canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("[avatar-canvas] could not export drawing", error);
      return null;
    }
  }

  private loadImageWithMode(src: string, useCrossOrigin: boolean): void {
    const canvas = this.getCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    if (useCrossOrigin) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      ctx.fillStyle = STICKERMANIA_COLORS.white;
      ctx.fillRect(0, 0, AVATAR_CANVAS_RESOLUTION, AVATAR_CANVAS_RESOLUTION);
      ctx.drawImage(img, 0, 0, AVATAR_CANVAS_RESOLUTION, AVATAR_CANVAS_RESOLUTION);
    };
    img.onerror = () => {
      if (useCrossOrigin) {
        this.loadImageWithMode(src, false);
      }
    };
    img.src = src;
  }

  private pointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): {x: number; y: number} {
    const rect = canvas.getBoundingClientRect();
    const scale = AVATAR_CANVAS_RESOLUTION / rect.width;
    return {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
    };
  }
}
