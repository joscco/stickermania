import type {CanvasPoint, ImageTransform, PaintDisplay} from "../shared/sticker-creator-types";

type CanvasSize = {width: number; height: number};

export function paintPointFromCanvasPoint(
  point: CanvasPoint,
  display: PaintDisplay | null,
  contentSize: CanvasSize | null,
): CanvasPoint | null {
  if (!display || !contentSize) return null;
  const x = (point.x - display.x) / display.scale;
  const y = (point.y - display.y) / display.scale;
  if (x < 0 || y < 0 || x > contentSize.width || y > contentSize.height) return null;
  return {x, y};
}

export function transformForPaintPointAtCanvasPoint(params: {
  paintPoint: CanvasPoint;
  point: CanvasPoint;
  scale: number;
  currentTransform: ImageTransform;
  contentSize: CanvasSize;
  viewportSize: CanvasSize;
  pixelRatio: number;
}): ImageTransform {
  const nextScale = normalizedPaintScale(params.scale);
  const fitScale = Math.min(
    params.viewportSize.width / params.contentSize.width,
    params.viewportSize.height / params.contentSize.height,
  );
  const displayScale = fitScale * nextScale;
  const width = params.contentSize.width * displayScale;
  const height = params.contentSize.height * displayScale;
  const centeredX = (params.viewportSize.width - width) / 2;
  const centeredY = (params.viewportSize.height - height) / 2;

  return clampPaintTransformToViewport(
    {
      ...params.currentTransform,
      x: params.point.x - params.paintPoint.x * displayScale - centeredX,
      y: params.point.y - params.paintPoint.y * displayScale - centeredY,
      scale: nextScale,
    },
    params.contentSize,
    params.viewportSize,
    params.pixelRatio,
  );
}

export function clampPaintTransformToViewport(
  transform: ImageTransform,
  contentSize: CanvasSize,
  viewportSize: CanvasSize,
  pixelRatio: number,
): ImageTransform {
  const fitScale = Math.min(viewportSize.width / contentSize.width, viewportSize.height / contentSize.height);
  const scale = normalizedPaintScale(transform.scale);
  const width = contentSize.width * fitScale * scale;
  const height = contentSize.height * fitScale * scale;

  return {
    ...transform,
    scale,
    x: clampPaintOffset(transform.x, width, viewportSize.width, pixelRatio),
    y: clampPaintOffset(transform.y, height, viewportSize.height, pixelRatio),
    rotation: 0,
  };
}

function normalizedPaintScale(scale: number): number {
  return Math.max(1, Math.min(8, scale));
}

function clampPaintOffset(offset: number, contentSize: number, canvasSize: number, pixelRatio: number): number {
  if (contentSize <= canvasSize) {
    const centeredPanRoom = (canvasSize - contentSize) / 2;
    const overscrollRoom = 72 * pixelRatio;
    const maxOffset = Math.max(centeredPanRoom, overscrollRoom);
    return Math.max(-maxOffset, Math.min(maxOffset, offset));
  }
  const maxOffset = (contentSize - canvasSize) / 2 + 72 * pixelRatio;
  return Math.max(-maxOffset, Math.min(maxOffset, offset));
}
