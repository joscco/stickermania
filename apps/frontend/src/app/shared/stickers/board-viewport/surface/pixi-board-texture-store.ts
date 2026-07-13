import {cachedAssetUrl} from "../../../../core/assets/asset-url-cache";
import {getSpriteSymbolSvg, preloadSprite} from "../../model/sprite-url.util";
import type {Texture} from "pixi.js";

type PixiModule = typeof import("pixi.js");

export class PixiBoardTextureStore {
  private readonly cache = new Map<string, Promise<Texture>>();

  constructor(private readonly pixi: PixiModule) {}

  textureFor(imageUrl: string): Promise<Texture> {
    const cached = this.cache.get(imageUrl);
    if (cached) {
      return cached;
    }

    const promise = this.loadTexture(imageUrl);
    this.cache.set(imageUrl, promise);
    return promise;
  }

  clear(): void {
    this.cache.clear();
  }

  private async loadTexture(imageUrl: string): Promise<Texture> {
    if (imageUrl.startsWith("sprite:#")) {
      await preloadSprite();
      const symbolSvg = getSpriteSymbolSvg(imageUrl);
      if (!symbolSvg) {
        return this.pixi.Texture.EMPTY;
      }
      return this.pixi.Assets.load<Texture>(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(symbolSvg)}`,
      );
    }

    const image = await this.loadImage(await cachedAssetUrl(imageUrl));
    return this.pixi.Texture.from(image);
  }

  private loadImage(imageUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load sticker image: ${imageUrl}`));
      image.src = imageUrl;

      if (image.complete && image.naturalWidth > 0) {
        resolve(image);
      }
    });
  }
}
