import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";

export const MAX_STICKER_OUTPUT_SIZE_PX = STICKERMANIA_CONFIG.stickers.maxOutputSizePx;

export type StickerOutputSize = {
  width: number;
  height: number;
};

export function boundedStickerOutputSize(
  size: StickerOutputSize,
  maxSide = MAX_STICKER_OUTPUT_SIZE_PX,
): StickerOutputSize {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const largestSide = Math.max(width, height);

  if (largestSide <= maxSide) {
    return {width, height};
  }

  const scale = maxSide / largestSide;
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

export function canvasToBoundedStickerPngDataUrl(
  source: HTMLCanvasElement,
  maxSide = MAX_STICKER_OUTPUT_SIZE_PX,
): string {
  const outputSize = boundedStickerOutputSize(source, maxSide);

  if (outputSize.width === source.width && outputSize.height === source.height) {
    return source.toDataURL("image/png");
  }

  const output = document.createElement("canvas");
  output.width = outputSize.width;
  output.height = outputSize.height;

  const context = output.getContext("2d");
  if (!context) {
    return source.toDataURL("image/png");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, output.width, output.height);
  context.drawImage(source, 0, 0, output.width, output.height);

  return output.toDataURL("image/png");
}
