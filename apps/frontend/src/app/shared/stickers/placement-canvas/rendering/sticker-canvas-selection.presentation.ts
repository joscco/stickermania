import {computed, signal, type Signal} from "@angular/core";
import type {StickerDefinition, StickerPlacement} from "@stickermania/shared";
import type {BoundingBox, Point, SelectionInfo} from "../../model/types";
import * as ops from "../../model/sticker-placement-ops";
import type {CanvasSelectionState} from "../state/canvas-selection.state";
import type {StickerCanvasOverlayInteractionState} from "../state/sticker-canvas-overlay-interaction.state";
import * as renderModel from "./sticker-canvas-render-model";

export type StickerActionBarMode = "edit" | "locked";

type SelectionPresentationOptions = {
  placements: () => StickerPlacement[];
  catalogById: () => Map<string, StickerDefinition>;
  stickerSizePx: () => number;
  alphaBounds: () => Map<string, BoundingBox>;
  readonlyMode: () => boolean;
  showActionBar: () => boolean;
  editablePlacementIds: () => string[] | null;
  unlockablePlacementIds: () => string[] | null;
  getRenderedSize: (instanceId: string) => {width: number; height: number};
  selectionState: CanvasSelectionState;
  overlayInteraction: StickerCanvasOverlayInteractionState;
};

export class StickerCanvasSelectionPresentation {
  readonly lockedActionBarPlacementId = signal<string | null>(null);
  readonly selectionIds: Signal<string[]>;
  readonly selectedPlacementsEditable: Signal<boolean>;
  readonly selectedActionBarVisible: Signal<boolean>;
  readonly lockedActionBarPlacement: Signal<StickerPlacement | null>;
  readonly lockedActionBarGeometry: Signal<renderModel.SelectionOverlayGeometry | null>;
  readonly lockedActionBarVisible: Signal<boolean>;
  readonly actionBarVisible: Signal<boolean>;
  readonly actionBarMode: Signal<StickerActionBarMode>;
  readonly actionBarBox: Signal<BoundingBox | null>;
  readonly actionBarCenterX: Signal<number>;
  readonly actionBarCenterY: Signal<number>;
  readonly actionBarRotation: Signal<number>;
  readonly overlayVisible: Signal<boolean>;
  readonly selectionCenterX: Signal<number>;
  readonly selectionCenterY: Signal<number>;
  readonly selectionInfo: Signal<SelectionInfo | null>;
  readonly overlayRotation: Signal<number>;
  readonly rawOverlayGeometry: Signal<renderModel.SelectionOverlayGeometry | null>;
  readonly overlayBox: Signal<BoundingBox | null>;
  readonly overlayRotationOrigin: Signal<Point | null>;

  private readonly editablePlacementIdSet: Signal<Set<string> | null>;
  private readonly unlockablePlacementIdSet: Signal<Set<string> | null>;

  constructor(private readonly options: SelectionPresentationOptions) {
    this.selectionIds = options.selectionState.selectionIds;
    this.editablePlacementIdSet = computed(() => {
      const ids = options.editablePlacementIds();
      return ids ? new Set(ids) : null;
    });
    this.unlockablePlacementIdSet = computed(() => {
      const ids = options.unlockablePlacementIds();
      return ids ? new Set(ids) : null;
    });
    this.selectedPlacementsEditable = computed(() =>
      this.selectionIds().every(id => this.isPlacementEditable(id)));
    this.selectedActionBarVisible = computed(() =>
      !options.readonlyMode()
      && options.showActionBar()
      && this.selectedPlacementsEditable()
      && this.selectionIds().length > 0
      && !options.selectionState.isMoveActive());
    this.lockedActionBarPlacement = computed(() => {
      const instanceId = this.lockedActionBarPlacementId();
      if (!instanceId || !this.isPlacementUnlockable(instanceId)) {
        return null;
      }
      return options.placements().find(placement => placement.instanceId === instanceId) ?? null;
    });
    this.lockedActionBarGeometry = computed(() => {
      const placement = this.lockedActionBarPlacement();
      return placement
        ? renderModel.selectionOverlayGeometry(
          options.placements(),
          [placement.instanceId],
          options.catalogById(),
          options.stickerSizePx(),
          stickerId => options.alphaBounds().get(stickerId) ?? null,
        )
        : null;
    });
    this.lockedActionBarVisible = computed(() =>
      !options.readonlyMode()
      && options.showActionBar()
      && !!this.lockedActionBarGeometry()
      && !options.selectionState.isMoveActive());
    this.actionBarVisible = computed(() =>
      this.lockedActionBarVisible() || this.selectedActionBarVisible());
    this.actionBarMode = computed(() => this.lockedActionBarVisible() ? "locked" : "edit");
    this.selectionInfo = computed(() =>
      ops.computeSelectionInfo(
        options.placements(),
        this.selectionIds(),
        options.getRenderedSize,
        options.selectionState.multiSelectionRotation(),
      ));
    this.overlayRotation = computed(() => {
      if (options.overlayInteraction.isRotating()) {
        return options.overlayInteraction.accumulatedRotateDeg();
      }
      const ids = this.selectionIds();
      if (ids.length === 1) {
        return options.placements().find(item => item.instanceId === ids[0])?.rotation ?? 0;
      }
      return this.selectionInfo()?.rotation ?? 0;
    });
    this.rawOverlayGeometry = computed(() =>
      renderModel.selectionOverlayGeometry(
        options.placements(),
        this.selectionIds(),
        options.catalogById(),
        options.stickerSizePx(),
        stickerId => options.alphaBounds().get(stickerId) ?? null,
      ));
    this.overlayBox = computed(() =>
      options.overlayInteraction.overlayBoxForSelection(
        this.selectionIds(),
        () => this.rawOverlayGeometry()?.box ?? null,
      ));
    this.overlayRotationOrigin = computed(() => {
      const raw = this.rawOverlayGeometry();
      const box = this.overlayBox();
      return raw?.rotationOrigin && box
        ? {x: raw.rotationOrigin.x - box.x, y: raw.rotationOrigin.y - box.y}
        : null;
    });
    this.overlayVisible = computed(() =>
      !options.readonlyMode()
      && this.selectedPlacementsEditable()
      && this.selectionIds().length > 0
      && !!this.overlayBox());
    this.selectionCenterX = this.selectionCenter("x");
    this.selectionCenterY = this.selectionCenter("y");
    this.actionBarBox = computed(() => this.lockedActionBarVisible()
      ? this.lockedActionBarGeometry()?.box ?? null
      : this.overlayBox() ?? this.selectionInfo()?.box ?? null);
    this.actionBarCenterX = computed(() => {
      const placement = this.lockedActionBarPlacement();
      return placement && this.lockedActionBarVisible() ? placement.x : this.selectionCenterX();
    });
    this.actionBarCenterY = computed(() => {
      const placement = this.lockedActionBarPlacement();
      return placement && this.lockedActionBarVisible() ? placement.y : this.selectionCenterY();
    });
    this.actionBarRotation = computed(() => {
      const placement = this.lockedActionBarPlacement();
      return placement && this.lockedActionBarVisible() ? placement.rotation : this.overlayRotation();
    });
  }

  isPlacementEditable(id: string): boolean {
    return !this.isPlacementLocked(id) && (this.editablePlacementIdSet()?.has(id) ?? true);
  }

  isPlacementLocked(id: string): boolean {
    return !!(this.options.placements().find(placement => placement.instanceId === id) as
      (StickerPlacement & {locked?: boolean}) | undefined)?.locked;
  }

  isPlacementUnlockable(id: string): boolean {
    if (!this.isPlacementLocked(id)) {
      return false;
    }
    const unlockableIds = this.unlockablePlacementIdSet();
    return unlockableIds ? unlockableIds.has(id) : true;
  }

  private selectionCenter(axis: "x" | "y"): Signal<number> {
    return computed(() => {
      const ids = this.selectionIds();
      return ids.length ? renderModel.selectionCenter(this.options.placements(), ids, axis) : 0;
    });
  }
}
