import {computed} from "@angular/core";
import type {StickerDefinition, StickerPlacement} from "@birthday/shared";
import {
  alphaMaskBounds,
  StickerAlphaMaskCache,
} from "../../model/sticker-alpha-mask";
import type {BoundingBox} from "../../model/types";
import {ensureStickerIntrinsicSize} from "../../model/sticker-intrinsic-size";

type AlphaMaskCache = Pick<StickerAlphaMaskCache, "revision" | "get" | "ensureLoaded" | "clear">;

export class StickerAlphaMaskPreloader {
  private preloadTimer: ReturnType<typeof setTimeout> | null = null;
  private preloadGeneration = 0;
  private lastPreloadSignature = "";

  readonly bounds = computed(() => {
    this.cache.revision();
    const bounds = new Map<string, BoundingBox>();

    for (const sticker of this.catalog()) {
      const mask = this.cache.get(sticker.id);
      const stickerBounds = mask ? alphaMaskBounds(mask) : null;
      if (stickerBounds) {
        bounds.set(sticker.id, stickerBounds);
      }
    }

    return bounds;
  });

  constructor(
    private readonly catalog: () => StickerDefinition[],
    private readonly cache: AlphaMaskCache = new StickerAlphaMaskCache(),
  ) {}

  sync(placements: StickerPlacement[], enabled: boolean): void {
    const stickers = this.placedStickerDefinitions(placements);
    for (const sticker of stickers) {
      ensureStickerIntrinsicSize(sticker);
    }

    if (!enabled) {
      this.cancelPreload();
      this.lastPreloadSignature = "";
      return;
    }

    const signature = stickers
      .map(sticker => `${sticker.id}:${sticker.imageUrl}`)
      .sort()
      .join("|");
    if (signature === this.lastPreloadSignature) {
      return;
    }

    this.lastPreloadSignature = signature;
    this.schedulePreload(stickers);
  }

  destroy(): void {
    this.cancelPreload();
    this.cache.clear();
  }

  private placedStickerDefinitions(placements: StickerPlacement[]): StickerDefinition[] {
    const catalog = new Map(this.catalog().map(sticker => [sticker.id, sticker]));
    const usedStickerIds = new Set<string>();
    const result: StickerDefinition[] = [];

    for (const placement of placements) {
      if (usedStickerIds.has(placement.stickerId)) {
        continue;
      }
      const sticker = catalog.get(placement.stickerId);
      if (sticker) {
        usedStickerIds.add(placement.stickerId);
        result.push(sticker);
      }
    }

    return result;
  }

  private schedulePreload(stickers: StickerDefinition[]): void {
    this.cancelPreload();
    if (stickers.length === 0) {
      return;
    }

    const generation = this.preloadGeneration;
    const loadNext = (index: number): void => {
      if (generation !== this.preloadGeneration) {
        return;
      }
      const sticker = stickers[index];
      if (!sticker) {
        this.preloadTimer = null;
        return;
      }

      this.cache.ensureLoaded(sticker);
      this.preloadTimer = setTimeout(() => loadNext(index + 1), 32);
    };

    this.preloadTimer = setTimeout(() => loadNext(0), 160);
  }

  private cancelPreload(): void {
    this.preloadGeneration++;
    if (this.preloadTimer !== null) {
      clearTimeout(this.preloadTimer);
      this.preloadTimer = null;
    }
  }
}
