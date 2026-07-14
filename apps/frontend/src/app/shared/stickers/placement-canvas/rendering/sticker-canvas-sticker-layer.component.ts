import {Component, computed, input, output} from "@angular/core";
import type {StickerDefinition, StickerPlacement} from "@stickermania/shared";
import * as renderModel from "./sticker-canvas-render-model";
import * as stickerTransformer from "./sticker-transform.util";
import {StickerAnimState, StickerItemComponent} from '../../primitives/sticker-item/sticker-item.component';
import {stickerIntrinsicSizeRevision} from '../../model/sticker-intrinsic-size';

type RenderedStickerItem = {
  instanceId: string;
  imageUrl: string;
  width: number;
  height: number;
  left: number;
  top: number;
  zIndex: number;
  cursor: string;
  transform: string;
  transformOrigin: string;
  motionDelay: string;
};

@Component({
  selector: "app-sticker-canvas-sticker-layer",
  standalone: true,
  imports: [StickerItemComponent],
  templateUrl: "./sticker-canvas-sticker-layer.component.html",
})
export class StickerCanvasStickerLayerComponent {
  readonly stickers = input<StickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly stickerSizePx = input(200);
  readonly showStickerShadow = input(false);
  readonly stickerShadowOffsetX = input(6);
  readonly stickerShadowOffsetY = input(6);
  readonly readonlyMode = input(false);
  readonly editablePlacementIds = input<string[] | null>(null);
  readonly selectionIds = input<string[]>([]);
  readonly moveActive = input(false);
  readonly decorativeStickerMotion = input(false);
  readonly decorativeStickerMotionDelays = input<Record<string, string>>({});
  readonly animStateFor = input<(id: string) => StickerAnimState>(() => "idle");

  readonly removed = output<string>();
  readonly animDone = output<string>();

  private readonly catalogById = computed(() => renderModel.stickerCatalogMap(this.stickerCatalog()));
  private readonly editablePlacementIdSet = computed(() => {
    const ids = this.editablePlacementIds();
    return ids ? new Set(ids) : null;
  });
  readonly renderedStickers = computed<RenderedStickerItem[]>(() => {
    stickerIntrinsicSizeRevision();
    const catalog = this.catalogById();
    const stickerSizePx = this.stickerSizePx();
    const motionDelays = this.decorativeStickerMotionDelays();

    return this.stickers().map(placement => {
      const definition = catalog.get(placement.stickerId);
      const size = stickerTransformer.stickerRenderedSize(placement, definition, stickerSizePx);

      return {
        instanceId: placement.instanceId,
        imageUrl: definition?.imageUrl ?? "",
        width: size.width,
        height: stickerSizePx,
        left: renderModel.stickerLeft(placement, definition, size),
        top: renderModel.stickerTop(placement, definition, size),
        zIndex: placement.zIndex,
        cursor: this.stickerCursor(placement),
        transform: renderModel.stickerTransform(placement),
        transformOrigin: renderModel.stickerAnchor(placement, definition, size),
        motionDelay: motionDelays[placement.instanceId] ?? "0s",
      };
    });
  });

  private stickerCursor(placement: StickerPlacement): string {
    if (this.readonlyMode()) return "default";
    if ((placement as StickerPlacement & {locked?: boolean}).locked) return "grab";
    if (!this.isPlacementEditable(placement.instanceId)) return "not-allowed";
    return this.moveActive() && this.selectionIds().includes(placement.instanceId) ? "grabbing" : "move";
  }

  private isPlacementEditable(instanceId: string): boolean {
    return this.editablePlacementIdSet()?.has(instanceId) ?? true;
  }
}
