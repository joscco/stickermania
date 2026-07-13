import {signal} from "@angular/core";
import type {StickerDefinition} from "@birthday/shared";
import {getSpriteViewBox} from "./sprite-url.util";

export type StickerIntrinsicSize = {width: number; height: number};

export const stickerIntrinsicSizeRevision = signal(0);

const rasterSizes = new Map<string, StickerIntrinsicSize & {sourceUrl: string | null}>();
const loading = new Map<string, string>();

export function stickerIntrinsicSize(sticker: StickerDefinition | undefined): StickerIntrinsicSize | null {
  if (!sticker) return null;

  if (sticker.imageUrl.startsWith("sprite:#")) {
    return getSpriteViewBox(sticker.imageUrl);
  }

  const cached = rasterSizes.get(sticker.id);
  return cached && (cached.sourceUrl === null || cached.sourceUrl === sticker.imageUrl)
    ? {width: cached.width, height: cached.height}
    : null;
}

export function ensureStickerIntrinsicSize(sticker: StickerDefinition): void {
  if (sticker.imageUrl.startsWith("sprite:#")) {
    return;
  }

  const cached = rasterSizes.get(sticker.id);
  if (cached?.sourceUrl === sticker.imageUrl || loading.get(sticker.id) === sticker.imageUrl) {
    return;
  }

  if (cached) {
    rasterSizes.delete(sticker.id);
    stickerIntrinsicSizeRevision.update(revision => revision + 1);
  }

  const sourceUrl = sticker.imageUrl;
  loading.set(sticker.id, sourceUrl);
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) {
      rasterSizes.set(sticker.id, {width, height, sourceUrl});
      stickerIntrinsicSizeRevision.update(revision => revision + 1);
    }
    if (loading.get(sticker.id) === sourceUrl) {
      loading.delete(sticker.id);
    }
  };
  image.onerror = () => {
    if (loading.get(sticker.id) === sourceUrl) {
      loading.delete(sticker.id);
    }
  };
  image.src = sourceUrl;
}

export function setStickerIntrinsicSizeForTesting(stickerId: string, size: StickerIntrinsicSize | null): void {
  if (size) {
    rasterSizes.set(stickerId, {...size, sourceUrl: null});
  } else {
    rasterSizes.delete(stickerId);
  }
  stickerIntrinsicSizeRevision.update(revision => revision + 1);
}
