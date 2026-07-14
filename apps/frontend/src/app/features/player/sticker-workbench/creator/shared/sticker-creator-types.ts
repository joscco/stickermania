import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import {STICKERMANIA_PAINT_COLORS} from "../../../../../shared/theme/stickermania-theme";

export type StickerCreatorResult = {dataUrl: string; name: string; packId?: string; adoptDraftLayers?: boolean};
export type CanvasPoint = {x: number; y: number};
export type ImageTransform = {x: number; y: number; scale: number; rotation: number};
export type PinchStart = {
  distance: number;
  center: CanvasPoint;
  transform: ImageTransform;
  paintPoint?: CanvasPoint;
};
export type PaintTool = "hand" | "brush" | "fill" | "eraser" | "outline" | "text";
export type PaintEraserMode = "paint" | "sticker";
export type PaintSourceLayer = "base" | "paint";
export type PaintDisplay = {x: number; y: number; width: number; height: number; scale: number};
export type PaintTextAlign = "left" | "center" | "right";
export type PaintTextVerticalAlign = "top" | "middle" | "bottom";

export const PAINT_COLORS = STICKERMANIA_PAINT_COLORS;
export const BRUSH_SIZES = [4, 8, 16, 28, 44] as const;
export const STICKER_OUTLINE_WIDTHS = [0, 12, 24, 40] as const;
export type StickerOutlineWidth = (typeof STICKER_OUTLINE_WIDTHS)[number];
export type PaintTextFontSize = number;
export const PAINT_TEXT_ALIGNMENTS = ["left", "center", "right"] as const;
export const PAINT_TEXT_VERTICAL_ALIGNMENTS = ["top", "middle", "bottom"] as const;
export const PAINT_WORKSPACE_MIN_SHORT_SIDE = STICKERMANIA_CONFIG.stickerCreator.paintWorkspaceMinShortSidePx;
export const PAINT_SOURCE_UPSCALE_LIMIT = STICKERMANIA_CONFIG.stickerCreator.paintSourceUpscaleLimit;
export const PAINT_WORKSPACE_INITIAL_MAX_LONG_SIDE = STICKERMANIA_CONFIG.stickerCreator.paintWorkspaceInitialMaxLongSidePx;
