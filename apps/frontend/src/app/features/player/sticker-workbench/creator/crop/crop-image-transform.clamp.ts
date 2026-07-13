import type {ImageTransform} from "./crop-editor.types";

export type CropImageTransformClampOptions = {
  canvas: HTMLCanvasElement | null;
  image: HTMLImageElement | null;
  minZoomOutFactor: number;
  maxImageScale: number;
};

export function clampCropImageScale(scale: number, options: CropImageTransformClampOptions): number {
  const {canvas, image, minZoomOutFactor, maxImageScale} = options;

  if (!canvas || !image) {
    return Math.max(0.05, Math.min(maxImageScale, scale));
  }

  const fitScale = Math.min(canvas.width / image.width, canvas.height / image.height);

  return Math.max(fitScale * minZoomOutFactor, Math.min(maxImageScale, scale));
}

export function clampCropImageTransform(
  transform: ImageTransform,
  options: CropImageTransformClampOptions,
): ImageTransform {
  const {canvas, image} = options;

  if (!canvas || !image) {
    return transform;
  }

  const scale = clampCropImageScale(transform.scale, options);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;

  return {
    ...transform,
    scale,
    x: clampAxis(transform.x, renderedWidth, canvas.width),
    y: clampAxis(transform.y, renderedHeight, canvas.height),
    rotation: 0,
  };
}

function clampAxis(center: number, contentSize: number, canvasSize: number): number {
  if (contentSize <= canvasSize) {
    return canvasSize / 2;
  }

  return Math.max(canvasSize - contentSize / 2, Math.min(contentSize / 2, center));
}
