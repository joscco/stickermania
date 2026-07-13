import type {CanvasPoint, ImageTransform} from "../shared/sticker-creator-types";

export type {CanvasPoint, ImageTransform};

export type CropMode = "arrange" | "lasso" | "polygon-lasso";

export type CropImageBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
