import {computed, type Signal} from "@angular/core";
import type {BoardStickerPlacement, StickerDefinition} from "@stickermania/shared";
import type {BoardBounds} from "../geometry/sticker-board-types";
import {buildPlacementLabels, PlacementBadge, PlacementLabel} from './sticker-board-label-layout';


export type StickerBoardLabelControllerOptions = {
  showPlacementLabels: () => boolean;
  readonlyMode: () => boolean;
  placements: () => BoardStickerPlacement[];
  stickerCatalog: () => StickerDefinition[];
  placementBadges: () => Record<string, PlacementBadge>;
  bounds: BoardBounds;
  boardWidth: number;
  boardHeight: number;
  stickerBaseSize: number;
};

export class StickerBoardLabelController {
  readonly labels: Signal<PlacementLabel[]>;

  constructor(private readonly options: StickerBoardLabelControllerOptions) {
    this.labels = computed(() => this.calculateLabels());
  }

  destroy(): void {
  }

  private calculateLabels(): PlacementLabel[] {
    if (!this.shouldShowLabels()) {
      return [];
    }

    return buildPlacementLabels({
      placements: this.options.placements(),
      stickerCatalog: this.options.stickerCatalog(),
      placementBadges: this.options.placementBadges(),
      bounds: this.options.bounds,
      boardWidth: this.options.boardWidth,
      boardHeight: this.options.boardHeight,
      stickerBaseSize: this.options.stickerBaseSize,
    });
  }

  private shouldShowLabels(): boolean {
    return this.options.showPlacementLabels() && this.options.readonlyMode();
  }
}
