import {signal} from "@angular/core";
import type {StickerDefinition} from "@stickermania/shared";
import {cachedAssetUrl} from "../../../core/assets/asset-url-cache";
import type {BoundingBox} from "./types";
import {getSpriteSymbolSvg, preloadSprite} from "./sprite-url.util";

export type StickerAlphaMask = {
  stickerId: string;
  requestUrl?: string | null;
  sourceUrl: string;
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
};

const ALPHA_THRESHOLD = 24;
const boundsCache = new WeakMap<StickerAlphaMask, BoundingBox | null>();

export const STICKER_ALPHA_MASK_OUTSET_PX = 4;

export class StickerAlphaMaskCache {
  readonly revision = signal(0);

  private readonly masks = new Map<string, StickerAlphaMask>();
  private readonly loading = new Map<string, string | null>();

  get(stickerId: string): StickerAlphaMask | null {
    return this.masks.get(stickerId) ?? null;
  }

  ensureLoaded(sticker: StickerDefinition): void {
    const requestedSourceUrl = stickerSourceUrl(sticker);
    const cached = this.masks.get(sticker.id);
    if (cached && (cached.requestUrl ?? cached.sourceUrl) === requestedSourceUrl) {
      return;
    }
    if (cached) {
      this.masks.delete(sticker.id);
      this.revision.update(revision => revision + 1);
    }

    if (this.loading.get(sticker.id) === requestedSourceUrl) {
      return;
    }

    this.loading.set(sticker.id, requestedSourceUrl);
    void loadStickerAlphaMask(sticker)
      .then(mask => {
        if (!mask) return;
        if (this.loading.get(sticker.id) !== requestedSourceUrl) return;
        this.masks.set(sticker.id, mask);
        this.revision.update(revision => revision + 1);
      })
      .catch(() => {
        // Callers fall back to full image bounds when masks fail.
      })
      .finally(() => {
        if (this.loading.get(sticker.id) === requestedSourceUrl) {
          this.loading.delete(sticker.id);
        }
      });
  }

  clear(): void {
    this.masks.clear();
    this.loading.clear();
  }
}

export async function loadStickerAlphaMask(sticker: StickerDefinition): Promise<StickerAlphaMask | null> {
  const requestUrl = stickerSourceUrl(sticker);
  const sourceUrl = await stickerAlphaSourceUrl(sticker);
  if (!sourceUrl) return null;

  const image = new Image();
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load sticker image: ${sourceUrl}`));
    image.src = sourceUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create alpha mask canvas context");
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  return {
    stickerId: sticker.id,
    requestUrl,
    sourceUrl,
    width: canvas.width,
    height: canvas.height,
    alpha: imageData.data,
  };
}

export function alphaMaskBounds(mask: StickerAlphaMask): BoundingBox | null {
  if (mask.width <= 0 || mask.height <= 0) return null;
  if (boundsCache.has(mask)) {
    return boundsCache.get(mask) ?? null;
  }

  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!isOpaque(mask, x, y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const bounds = maxX < minX || maxY < minY
    ? null
    : {
      x: minX / mask.width,
      y: minY / mask.height,
      w: (maxX - minX + 1) / mask.width,
      h: (maxY - minY + 1) / mask.height,
    };

  boundsCache.set(mask, bounds);
  return bounds;
}

export async function deriveStickerOverlayBoundsFromDataUrl(dataUrl: string): Promise<BoundingBox | undefined> {
  const mask = await loadStickerAlphaMask({
    id: "pending-upload",
    imageUrl: dataUrl,
  }).catch(() => null);
  const bounds = mask ? alphaMaskBounds(mask) : null;
  return bounds
    ? {
      x: bounds.x + bounds.w / 2,
      y: bounds.y + bounds.h / 2,
      w: bounds.w,
      h: bounds.h,
    }
    : undefined;
}

export function outsetNormalizedBounds(
  bounds: BoundingBox | null,
  offsetPx: number,
  widthPx: number,
  heightPx: number,
): BoundingBox | null {
  if (!bounds || offsetPx <= 0 || widthPx <= 0 || heightPx <= 0) {
    return bounds;
  }

  return {
    x: (bounds.x * widthPx - offsetPx) / widthPx,
    y: (bounds.y * heightPx - offsetPx) / heightPx,
    w: (bounds.w * widthPx + offsetPx * 2) / widthPx,
    h: (bounds.h * heightPx + offsetPx * 2) / heightPx,
  };
}

async function stickerAlphaSourceUrl(sticker: StickerDefinition): Promise<string | null> {
  const sourceUrl = stickerSourceUrl(sticker);
  if (!sourceUrl) return null;

  if (!sourceUrl.startsWith("sprite:#")) {
    return cachedAssetUrl(sourceUrl);
  }

  await preloadSprite();
  const svg = getSpriteSymbolSvg(sourceUrl);
  if (!svg) return null;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function stickerSourceUrl(sticker: StickerDefinition): string | null {
  const stickerWithPossibleSource = sticker as StickerDefinition & {
    src?: string;
    imageUrl?: string;
    url?: string;
  };

  return stickerWithPossibleSource.src
    ?? stickerWithPossibleSource.imageUrl
    ?? stickerWithPossibleSource.url
    ?? null;
}

function isOpaque(mask: StickerAlphaMask, x: number, y: number): boolean {
  const pixelX = Math.floor(x);
  const pixelY = Math.floor(y);

  if (pixelX < 0 || pixelY < 0 || pixelX >= mask.width || pixelY >= mask.height) {
    return false;
  }

  return (mask.alpha[(pixelY * mask.width + pixelX) * 4 + 3] ?? 0) > ALPHA_THRESHOLD;
}
