import {
  PAINT_SOURCE_UPSCALE_LIMIT,
  PAINT_WORKSPACE_INITIAL_MAX_LONG_SIDE,
  PAINT_WORKSPACE_MIN_SHORT_SIDE,
  type PaintSourceLayer,
} from "../shared/sticker-creator-types";
import {STICKERMANIA_COLORS} from "../../../../../shared/theme/stickermania-theme";
import {drawPaintTextBox, type PaintTextBox} from "./paint-text-utils";

type CanvasSize = {width: number; height: number};
type PaintSource = HTMLImageElement | HTMLCanvasElement | null;

export function configureImageSmoothing(ctx: CanvasRenderingContext2D): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load sticker layer image"));
    image.src = dataUrl;
  });
}

export function paintWorkspaceSizeForSource(source: PaintSource): CanvasSize {
  if (!source) {
    return {width: PAINT_WORKSPACE_MIN_SHORT_SIDE, height: PAINT_WORKSPACE_MIN_SHORT_SIDE};
  }

  const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return {width: PAINT_WORKSPACE_MIN_SHORT_SIDE, height: PAINT_WORKSPACE_MIN_SHORT_SIDE};
  }

  const shortSide = Math.min(sourceWidth, sourceHeight);
  const longSide = Math.max(sourceWidth, sourceHeight);
  const minScale = PAINT_WORKSPACE_MIN_SHORT_SIDE / shortSide;
  const maxScale = PAINT_WORKSPACE_INITIAL_MAX_LONG_SIDE / longSide;
  const scale = Math.min(Math.max(1, minScale), maxScale);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function createPaintWorkspace(
  source: PaintSource,
  sourceLayer: PaintSourceLayer,
): {base: HTMLCanvasElement; paint: HTMLCanvasElement} {
  const {width, height} = paintWorkspaceSizeForSource(source);
  const base = document.createElement("canvas");
  const paint = document.createElement("canvas");
  base.width = width;
  base.height = height;
  paint.width = width;
  paint.height = height;

  const targetCtx = (sourceLayer === "paint" ? paint : base).getContext("2d");
  if (targetCtx && source) {
    const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const maxWidth = width * 0.72;
    const maxHeight = height * 0.56;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, PAINT_SOURCE_UPSCALE_LIMIT);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    configureImageSmoothing(targetCtx);
    targetCtx.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  return {base, paint};
}

export function createPaintWorkspaceFromLayers(
  baseSource: HTMLImageElement | HTMLCanvasElement,
  paintSource: HTMLImageElement | HTMLCanvasElement,
  workspace: CanvasSize,
): {base: HTMLCanvasElement; paint: HTMLCanvasElement} {
  const base = document.createElement("canvas");
  const paint = document.createElement("canvas");
  base.width = Math.max(1, Math.round(workspace.width));
  base.height = Math.max(1, Math.round(workspace.height));
  paint.width = base.width;
  paint.height = base.height;

  const baseCtx = base.getContext("2d");
  const paintCtx = paint.getContext("2d");
  if (baseCtx) {
    configureImageSmoothing(baseCtx);
    baseCtx.drawImage(baseSource, 0, 0, base.width, base.height);
  }
  if (paintCtx) {
    configureImageSmoothing(paintCtx);
    paintCtx.drawImage(paintSource, 0, 0, paint.width, paint.height);
  }

  return {base, paint};
}

export async function restorePaintLayerCanvases(
  baseCanvas: HTMLCanvasElement,
  paintCanvas: HTMLCanvasElement,
  snapshot: {baseDataUrl: string; paintDataUrl: string},
): Promise<boolean> {
  const [baseImage, paintImage] = await Promise.all([
    loadImage(snapshot.baseDataUrl),
    loadImage(snapshot.paintDataUrl),
  ]);
  const baseCtx = baseCanvas.getContext("2d");
  const paintCtx = paintCanvas.getContext("2d");
  if (!baseCtx || !paintCtx) return false;

  const width = Math.max(1, baseImage.naturalWidth || paintImage.naturalWidth || baseCanvas.width);
  const height = Math.max(1, baseImage.naturalHeight || paintImage.naturalHeight || baseCanvas.height);
  baseCanvas.width = width;
  baseCanvas.height = height;
  paintCanvas.width = width;
  paintCanvas.height = height;

  configureImageSmoothing(baseCtx);
  configureImageSmoothing(paintCtx);
  baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
  baseCtx.drawImage(baseImage, 0, 0, baseCanvas.width, baseCanvas.height);
  paintCtx.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  paintCtx.drawImage(paintImage, 0, 0, paintCanvas.width, paintCanvas.height);
  return true;
}

export function createCompositeCanvas(
  base: HTMLCanvasElement | null,
  paint: HTMLCanvasElement | null,
  outlinePx: number,
  textBox: PaintTextBox | null = null,
): HTMLCanvasElement | null {
  const content = createPaintContentCanvas(base, paint, textBox);
  if (!content) return null;

  const padding = Math.max(0, Math.round(outlinePx));
  if (padding === 0) return content;

  const output = document.createElement("canvas");
  output.width = content.width + padding * 2;
  output.height = content.height + padding * 2;
  const outputCtx = output.getContext("2d");
  if (!outputCtx) return content;
  configureImageSmoothing(outputCtx);
  drawAlphaOutline(outputCtx, content, padding, padding, padding);
  outputCtx.drawImage(content, padding, padding);
  return output;
}

export function createPaintOutlineCanvas(
  base: HTMLCanvasElement | null,
  paint: HTMLCanvasElement | null,
  outlinePx: number,
  textBox: PaintTextBox | null = null,
): HTMLCanvasElement | null {
  const padding = Math.max(0, Math.round(outlinePx));
  if (padding === 0) return null;

  const content = createPaintContentCanvas(base, paint, textBox);
  if (!content) return null;

  const output = document.createElement("canvas");
  output.width = content.width + padding * 2;
  output.height = content.height + padding * 2;
  const outputCtx = output.getContext("2d");
  if (!outputCtx) return null;
  configureImageSmoothing(outputCtx);
  drawAlphaOutline(outputCtx, content, padding, padding, padding);
  return output;
}

export function createPaintContentCanvas(
  base: HTMLCanvasElement | null,
  paint: HTMLCanvasElement | null,
  textBox: PaintTextBox | null = null,
): HTMLCanvasElement | null {
  if (!base) return null;

  const content = document.createElement("canvas");
  content.width = base.width;
  content.height = base.height;
  const contentCtx = content.getContext("2d");
  if (!contentCtx) return null;
  configureImageSmoothing(contentCtx);
  contentCtx.clearRect(0, 0, content.width, content.height);
  contentCtx.drawImage(base, 0, 0);
  if (paint) {
    contentCtx.drawImage(paint, 0, 0);
  }
  drawPaintTextBox(contentCtx, textBox);
  return content;
}

export function trimTransparentCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = source.getContext("2d");
  if (!ctx) return source;

  const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
  const alphaThreshold = 8;
  const padding = 2;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const alpha = pixels[(y * source.width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(source.width - 1, maxX + padding);
  maxY = Math.min(source.height - 1, maxY + padding);

  const trimmed = document.createElement("canvas");
  trimmed.width = maxX - minX + 1;
  trimmed.height = maxY - minY + 1;
  const trimmedCtx = trimmed.getContext("2d");
  if (!trimmedCtx) return trimmed;
  configureImageSmoothing(trimmedCtx);
  trimmedCtx.drawImage(
    source,
    minX,
    minY,
    trimmed.width,
    trimmed.height,
    0,
    0,
    trimmed.width,
    trimmed.height,
  );
  return trimmed;
}

function drawAlphaOutline(
  targetCtx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  x: number,
  y: number,
  radius: number,
): void {
  if (radius <= 0) return;
  const outline = document.createElement("canvas");
  outline.width = targetCtx.canvas.width;
  outline.height = targetCtx.canvas.height;
  const outlineCtx = outline.getContext("2d");
  if (!outlineCtx) return;
  configureImageSmoothing(outlineCtx);

  for (let distance = 1; distance <= radius; distance++) {
    const steps = Math.max(12, Math.ceil(distance * Math.PI));
    for (let step = 0; step < steps; step++) {
      const angle = step / steps * Math.PI * 2;
      outlineCtx.drawImage(
        source,
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
      );
    }
  }

  outlineCtx.globalCompositeOperation = "source-in";
  outlineCtx.fillStyle = STICKERMANIA_COLORS.white;
  outlineCtx.fillRect(0, 0, outline.width, outline.height);
  outlineCtx.globalCompositeOperation = "source-over";
  targetCtx.drawImage(outline, 0, 0);
}
