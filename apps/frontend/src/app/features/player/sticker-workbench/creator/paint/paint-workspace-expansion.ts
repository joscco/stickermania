import type {CanvasPoint, ImageTransform, PaintDisplay} from "../shared/sticker-creator-types";
import {clampPaintTransformToViewport} from "./paint-transform-utils";

type CanvasSize = {width: number; height: number};
type PaintWorkspaceExpansionRequest = {left: number; top: number; right: number; bottom: number};

export type ExpandedPaintWorkspace = {
  offset: Pick<CanvasPoint, "x" | "y">;
  transform: ImageTransform;
  display: PaintDisplay;
};

export function expandPaintWorkspaceCanvases(params: {
  baseCanvas: HTMLCanvasElement;
  paintCanvas: HTMLCanvasElement;
  display: PaintDisplay;
  viewportSize: CanvasSize;
  transform: ImageTransform;
  canvasPixelRatio: number;
  maxSide: number;
  expand: PaintWorkspaceExpansionRequest;
}): ExpandedPaintWorkspace | null {
  const left = Math.max(0, Math.round(params.expand.left));
  const top = Math.max(0, Math.round(params.expand.top));
  const requestedWidth = params.baseCanvas.width + left + Math.max(0, Math.round(params.expand.right));
  const requestedHeight = params.baseCanvas.height + top + Math.max(0, Math.round(params.expand.bottom));
  const nextWidth = Math.min(params.maxSide, requestedWidth);
  const nextHeight = Math.min(params.maxSide, requestedHeight);
  const right = nextWidth - params.baseCanvas.width - left;
  const bottom = nextHeight - params.baseCanvas.height - top;

  if (nextWidth <= params.baseCanvas.width && nextHeight <= params.baseCanvas.height) return null;
  if (left < 0 || top < 0 || right < 0 || bottom < 0) return null;

  const oldWidth = params.baseCanvas.width;
  const oldHeight = params.baseCanvas.height;
  const oldScale = params.display.scale;
  resizeLayerCanvas(params.baseCanvas, nextWidth, nextHeight, left, top);
  resizeLayerCanvas(params.paintCanvas, nextWidth, nextHeight, left, top);

  const nextFitScale = Math.min(params.viewportSize.width / nextWidth, params.viewportSize.height / nextHeight);
  const nextTransformScale = nextFitScale > 0 ? oldScale / nextFitScale : params.transform.scale;
  const desiredDisplayX = params.display.x - left * oldScale;
  const desiredDisplayY = params.display.y - top * oldScale;
  const nextDisplayWidth = nextWidth * oldScale;
  const nextDisplayHeight = nextHeight * oldScale;

  return {
    offset: {x: left, y: top},
    transform: clampPaintTransformToViewport(
      {
        ...params.transform,
        scale: nextTransformScale,
        x: desiredDisplayX - (params.viewportSize.width - nextDisplayWidth) / 2,
        y: desiredDisplayY - (params.viewportSize.height - nextDisplayHeight) / 2,
      },
      params.baseCanvas,
      params.viewportSize,
      params.canvasPixelRatio,
    ),
    display: {
      x: desiredDisplayX,
      y: desiredDisplayY,
      width: oldWidth * oldScale + (left + right) * oldScale,
      height: oldHeight * oldScale + (top + bottom) * oldScale,
      scale: oldScale,
    },
  };
}

function resizeLayerCanvas(canvas: HTMLCanvasElement, width: number, height: number, offsetX: number, offsetY: number): void {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const copyCtx = copy.getContext("2d");
  if (copyCtx) {
    copyCtx.drawImage(canvas, 0, 0);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(copy, offsetX, offsetY);
}
