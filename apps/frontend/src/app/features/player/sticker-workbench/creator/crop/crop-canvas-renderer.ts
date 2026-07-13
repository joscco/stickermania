import type {CanvasPoint, CropMode, ImageTransform} from "./crop-editor.types";
import {STICKERMANIA_COLORS} from "../../../../../shared/theme/stickermania-theme";

export type CropCanvasRenderState = {
  canvas: HTMLCanvasElement;
  sourceImage: HTMLImageElement | null;
  imageTransform: ImageTransform;
  lassoPath: CanvasPoint[];
  cropMode: CropMode;
  selectedPolygonPointIndex: number | null;
  canvasPixelRatio: number;
};

export class CropCanvasRenderer {
  render(state: CropCanvasRenderState): void {
    const context = state.canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.clearRect(0, 0, state.canvas.width, state.canvas.height);

    if (state.sourceImage) {
      drawTransformedImage(context, state.sourceImage, state.imageTransform);
    }

    this.drawSelectionPreview(context, state);
  }

  private drawSelectionPreview(
    context: CanvasRenderingContext2D,
    state: CropCanvasRenderState,
  ): void {
    if (state.lassoPath.length === 0) {
      return;
    }

    if (state.lassoPath.length > 1) {
      this.drawLassoPreviewMask(context, state.canvas, state.lassoPath);
      this.drawLassoPath(context, state);
    }

    if (state.cropMode === "polygon-lasso") {
      this.drawPolygonHandles(context, state);
    }
  }

  private drawLassoPreviewMask(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    lassoPath: CanvasPoint[],
  ): void {
    if (lassoPath.length < 3) {
      return;
    }

    context.save();
    context.fillStyle = "rgba(17, 24, 39, 0.62)";
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.moveTo(lassoPath[0].x, lassoPath[0].y);

    for (const point of lassoPath.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    context.closePath();
    context.fill("evenodd");
    context.restore();
  }

  private drawLassoPath(context: CanvasRenderingContext2D, state: CropCanvasRenderState): void {
    context.strokeStyle = STICKERMANIA_COLORS.yellow;
    context.lineWidth = 5 * state.canvasPixelRatio;
    context.setLineDash([10 * state.canvasPixelRatio, 20 * state.canvasPixelRatio]);
    context.lineJoin = "round";
    context.lineCap = "round";

    context.beginPath();
    context.moveTo(state.lassoPath[0].x, state.lassoPath[0].y);

    for (const point of state.lassoPath.slice(1)) {
      context.lineTo(point.x, point.y);
    }

    if (state.cropMode === "polygon-lasso" && state.lassoPath.length > 2) {
      context.closePath();
    }

    context.stroke();
    context.setLineDash([]);
  }

  private drawPolygonHandles(context: CanvasRenderingContext2D, state: CropCanvasRenderState): void {
    context.save();

    for (let index = 0; index < state.lassoPath.length; index++) {
      const point = state.lassoPath[index];
      const selected = state.selectedPolygonPointIndex === index;

      context.fillStyle = selected ? STICKERMANIA_COLORS.red : index === 0 ? STICKERMANIA_COLORS.yellow : STICKERMANIA_COLORS.white;
      context.strokeStyle = STICKERMANIA_COLORS.ink;
      context.lineWidth = 3 * state.canvasPixelRatio;

      context.beginPath();
      context.arc(point.x, point.y, (selected ? 11 : index === 0 ? 9 : 6) * state.canvasPixelRatio, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }

    context.restore();
  }
}

export function drawTransformedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  imageTransform: ImageTransform,
): void {
  context.save();

  configureImageSmoothing(context);

  context.translate(imageTransform.x, imageTransform.y);
  context.rotate(imageTransform.rotation);
  context.scale(imageTransform.scale, imageTransform.scale);
  context.drawImage(image, -image.width / 2, -image.height / 2);

  context.restore();
}

function configureImageSmoothing(context: CanvasRenderingContext2D): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
}
