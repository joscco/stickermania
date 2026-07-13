import type {ImageTransform, PaintDisplay} from "../shared/sticker-creator-types";
import {configureImageSmoothing} from "./paint-canvas-utils";
import {drawPaintTextBox, type PaintTextBox} from "./paint-text-utils";
import {clampPaintTransformToViewport} from "./paint-transform-utils";

export type PaintEditorRenderFrame = {
  transform: ImageTransform;
  display: PaintDisplay;
};

export function drawPaintEditorFrame(params: {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  baseCanvas: HTMLCanvasElement;
  paintCanvas: HTMLCanvasElement | null;
  outlineCanvas: HTMLCanvasElement | null;
  textBox: PaintTextBox | null;
  transform: ImageTransform;
  outlineWidth: number;
  canvasPixelRatio: number;
}): PaintEditorRenderFrame | null {
  params.ctx.clearRect(0, 0, params.canvas.width, params.canvas.height);

  const transform = clampPaintTransformToViewport(
    params.transform,
    params.baseCanvas,
    params.canvas,
    params.canvasPixelRatio,
  );
  const fitScale = Math.min(params.canvas.width / params.baseCanvas.width, params.canvas.height / params.baseCanvas.height);
  const scale = fitScale * transform.scale;
  const width = params.baseCanvas.width * scale;
  const height = params.baseCanvas.height * scale;
  const displayX = (params.canvas.width - width) / 2 + transform.x;
  const displayY = (params.canvas.height - height) / 2 + transform.y;

  configureImageSmoothing(params.ctx);
  const outlinePadding = Math.max(0, Math.round(params.outlineWidth));

  if (outlinePadding > 0 && params.outlineCanvas) {
    params.ctx.drawImage(
      params.outlineCanvas,
      displayX - outlinePadding * scale,
      displayY - outlinePadding * scale,
      width + outlinePadding * 2 * scale,
      height + outlinePadding * 2 * scale,
    );
  }

  params.ctx.drawImage(params.baseCanvas, displayX, displayY, width, height);
  if (params.paintCanvas) {
    params.ctx.drawImage(params.paintCanvas, displayX, displayY, width, height);
  }
  if (params.textBox) {
    params.ctx.save();
    params.ctx.beginPath();
    params.ctx.rect(displayX, displayY, width, height);
    params.ctx.clip();
    params.ctx.translate(displayX, displayY);
    params.ctx.scale(scale, scale);
    drawPaintTextBox(params.ctx, params.textBox);
    params.ctx.restore();
  }

  return {
    transform,
    display: {x: displayX, y: displayY, width, height, scale},
  };
}
