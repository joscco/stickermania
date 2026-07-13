import {Component, computed, effect, input, signal} from "@angular/core";
import {cachedAssetUrl} from '../../../../core/assets/asset-url-cache';
import {getSpriteId} from '../../model/sprite-url.util';
import {STICKERMANIA_COLORS} from "../../../theme/stickermania-theme";

const RASTER_SHADOW_CACHE = new Map<string, string>();
const RASTER_SHADOW_IN_FLIGHT = new Map<string, Promise<string | null>>();

@Component({
  selector: "app-sticker-shadow",
  standalone: true,
  templateUrl: "./sticker-shadow.component.html",
  host: {class: "block leading-[0]"},
})
export class StickerShadowComponent {
  readonly imageUrl = input.required<string>();
  readonly alt = input("");

  readonly isSprite = computed(() => this.imageUrl().startsWith("sprite:#"));
  readonly rasterShadowUrl = signal<string | null>(null);

  constructor() {
    effect(() => {
      const imageUrl = this.imageUrl();
      if (imageUrl.startsWith("sprite:#")) {
        this.rasterShadowUrl.set(null);
        return;
      }

      const cached = RASTER_SHADOW_CACHE.get(imageUrl);
      if (cached) {
        this.rasterShadowUrl.set(cached);
        return;
      }

      this.rasterShadowUrl.set(null);
      void this.resolveRasterShadow(imageUrl);
    });
  }

  getLocalHref(imageUrl: string): string {
    return `#${getSpriteId(imageUrl)}`;
  }

  private async resolveRasterShadow(imageUrl: string): Promise<void> {
    const loadUrl = await cachedAssetUrl(imageUrl);
    const shadowUrl = await cachedRasterShadow(imageUrl, loadUrl);
    if (!shadowUrl || this.imageUrl() !== imageUrl) return;
    this.rasterShadowUrl.set(shadowUrl);
  }
}

function cachedRasterShadow(imageUrl: string, loadUrl: string): Promise<string | null> {
  const cached = RASTER_SHADOW_CACHE.get(imageUrl);
  if (cached) return Promise.resolve(cached);
  const inFlight = RASTER_SHADOW_IN_FLIGHT.get(imageUrl);
  if (inFlight) return inFlight;

  const loader = new StickerShadowLoader().createRasterShadow(imageUrl, loadUrl)
    .finally(() => RASTER_SHADOW_IN_FLIGHT.delete(imageUrl));
  RASTER_SHADOW_IN_FLIGHT.set(imageUrl, loader);
  return loader;
}

class StickerShadowLoader {
  async createRasterShadow(imageUrl: string, loadUrl: string): Promise<string | null> {
    const image = await this.loadImage(loadUrl).catch(() => null);
    if (!image) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, image.naturalWidth);
    canvas.height = Math.max(1, image.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = STICKERMANIA_COLORS.inkHard;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const shadowUrl = canvas.toDataURL("image/png");
    RASTER_SHADOW_CACHE.set(imageUrl, shadowUrl);
    return shadowUrl;
  }

  private loadImage(imageUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load sticker shadow image"));
      image.src = imageUrl;
    });
  }
}
