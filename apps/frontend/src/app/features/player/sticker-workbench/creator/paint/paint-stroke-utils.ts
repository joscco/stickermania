import type {CanvasPoint, PaintDisplay, PaintEraserMode, PaintTool} from "../shared/sticker-creator-types";

export function drawPaintSegment(params: {
  from: CanvasPoint;
  to: CanvasPoint;
  tool: PaintTool;
  eraserMode: PaintEraserMode;
  baseCanvas: HTMLCanvasElement | null;
  paintCanvas: HTMLCanvasElement | null;
  color: string;
  brushSize: number;
  canvasPixelRatio: number;
  display: PaintDisplay | null;
}): void {
  const eraseSticker = params.tool === "eraser" && params.eraserMode === "sticker";
  const targetCanvases = eraseSticker
    ? [params.baseCanvas, params.paintCanvas]
    : [params.paintCanvas];
  const brushWidth = paintBrushWidth(params.brushSize, params.canvasPixelRatio, params.display);

  for (const canvas of targetCanvases) {
    if (!canvas) continue;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.save();
    ctx.lineWidth = brushWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = params.tool === "brush" ? "source-over" : "destination-out";
    ctx.strokeStyle = params.tool === "brush" ? params.color : "rgba(0, 0, 0, 1)";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(params.from.x, params.from.y);
    ctx.lineTo(params.to.x, params.to.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(params.to.x, params.to.y, brushWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function paintBrushWidth(brushSize: number, canvasPixelRatio: number, display: PaintDisplay | null): number {
  const visualWidth = brushSize * canvasPixelRatio;
  if (!display || display.scale <= 0) return visualWidth;
  return Math.max(1, visualWidth / display.scale);
}
