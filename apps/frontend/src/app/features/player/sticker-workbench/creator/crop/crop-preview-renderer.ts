import type {CanvasPoint, CropImageBounds, ImageTransform} from "./crop-editor.types";
import {drawTransformedImage} from "./crop-canvas-renderer";
import {canvasToBoundedStickerPngDataUrl} from "../shared/sticker-output-canvas";

export type CropSelectionPreviewState = {
  sourceCanvas: HTMLCanvasElement;
  sourceImage: HTMLImageElement;
  imageTransform: ImageTransform;
  lassoPath: CanvasPoint[];
};

export type CropFullImagePreviewState = {
  sourceImage: HTMLImageElement;
  imageTransform: ImageTransform;
};

export class CropPreviewRenderer {
  renderSelectionPreview(state: CropSelectionPreviewState): string | null {
    if (state.lassoPath.length < 3) {
      return null;
    }

    const minX = Math.max(0, Math.floor(Math.min(...state.lassoPath.map(point => point.x))));
    const minY = Math.max(0, Math.floor(Math.min(...state.lassoPath.map(point => point.y))));
    const maxX = Math.min(state.sourceCanvas.width, Math.ceil(Math.max(...state.lassoPath.map(point => point.x))));
    const maxY = Math.min(state.sourceCanvas.height, Math.ceil(Math.max(...state.lassoPath.map(point => point.y))));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = width;
    previewCanvas.height = height;

    const context = previewCanvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.clearRect(0, 0, width, height);
    context.save();

    context.beginPath();
    context.moveTo(state.lassoPath[0].x - minX, state.lassoPath[0].y - minY);

    for (const point of state.lassoPath.slice(1)) {
      context.lineTo(point.x - minX, point.y - minY);
    }

    context.closePath();
    context.clip();
    context.translate(-minX, -minY);

    drawTransformedImage(context, state.sourceImage, state.imageTransform);

    context.restore();

    return canvasToBoundedStickerPngDataUrl(previewCanvas);
  }

  renderFullImagePreview(state: CropFullImagePreviewState): string | null {
    const bounds = transformedImageBounds(state.sourceImage, state.imageTransform);
    const minX = Math.floor(bounds.minX);
    const minY = Math.floor(bounds.minY);
    const maxX = Math.ceil(bounds.maxX);
    const maxY = Math.ceil(bounds.maxY);
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = width;
    previewCanvas.height = height;

    const context = previewCanvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.clearRect(0, 0, width, height);
    context.translate(-minX, -minY);

    drawTransformedImage(context, state.sourceImage, state.imageTransform);

    return canvasToBoundedStickerPngDataUrl(previewCanvas);
  }
}

function transformedImageBounds(image: HTMLImageElement, imageTransform: ImageTransform): CropImageBounds {
  const halfWidth = image.width * imageTransform.scale / 2;
  const halfHeight = image.height * imageTransform.scale / 2;

  return {
    minX: imageTransform.x - halfWidth,
    minY: imageTransform.y - halfHeight,
    maxX: imageTransform.x + halfWidth,
    maxY: imageTransform.y + halfHeight,
  };
}
