import type {StickerPlacement} from "@stickermania/shared";
import * as ops from "../../model/sticker-placement-ops";
import type {StickerCanvasOverlayInteractionState} from "../state/sticker-canvas-overlay-interaction.state";
import {
  applyStickerCanvasActionCommand,
  applyStickerCanvasOverlayTransform,
  isStickerCanvasOverlayTransformType,
  type StickerCanvasCommandResult,
} from "./sticker-canvas-commands";
import {OverlayHandleEvent} from '../sticker-overlay/sticker-overlay.component';
import {ActionBarAction} from '../sticker-action-bar/sticker-action-bar.component';
import {BoundingBox} from '../../model/types';

export type StickerCanvasEditControllerOptions = {
  placements: () => StickerPlacement[];
  selectionIds: () => string[];
  canEditPlacements: (ids: string[]) => boolean;
  overlayBox: () => BoundingBox | null;
  overlayRotation: () => number;
  canvasRect: () => DOMRect;
  getRenderedSize: (id: string) => {width: number; height: number};
  minScale: () => number;
  maxScale: () => number;
  overlayInteraction: StickerCanvasOverlayInteractionState;
  commitPlacements: (placements: StickerPlacement[]) => void;
  emitPlacementsChanged: (placements: StickerPlacement[]) => void;
  clearSelection: () => void;
  selectIds: (ids: string[], mode: "auto" | "multi") => void;
  setEntering: (ids: string[]) => void;
  setSettling: (ids: string[]) => void;
  scheduleRemoval: (ids: string[], done: () => void) => void;
};

export class StickerCanvasEditController {
  constructor(private readonly options: StickerCanvasEditControllerOptions) {}

  overlayHandle(event: OverlayHandleEvent): void {
    const ids = this.options.selectionIds();
    if (!ids.length || !this.options.canEditPlacements(ids)) return;

    const type = event.type as string;
    if (type === "rotate") {
      this.handleRotate(event, ids);
    } else if (isStickerCanvasOverlayTransformType(type)) {
      this.handleTransform(event, ids, type);
    }

    if (event.done) {
      this.options.setSettling(ids);
    }
  }

  actionBarAction(action: ActionBarAction): void {
    const ids = this.options.selectionIds();
    if (!this.options.canEditPlacements(ids)) return;

    this.applyCommandResult(applyStickerCanvasActionCommand({
      action,
      placements: this.options.placements(),
      ids,
    }));
  }

  private handleRotate(event: OverlayHandleEvent, ids: string[]): void {
    if (event.done) {
      this.options.overlayInteraction.finishRotate();
      return;
    }

    this.options.overlayInteraction.beginRotate(this.options.overlayRotation(), this.options.overlayBox());
    const box = this.options.overlayBox();

    if (!box) {
      return;
    }

    const delta = this.options.overlayInteraction.rotationDeltaForPointer(
      box,
      this.options.canvasRect(),
      event.clientX,
      event.clientY,
    );

    if (delta !== null) {
      this.options.commitPlacements(ops.applyRotationDelta(this.options.placements(), ids, delta));
    }
  }

  private handleTransform(
    event: OverlayHandleEvent,
    ids: string[],
    type: "scale" | "n" | "s" | "e" | "w",
  ): void {
    const updated = applyStickerCanvasOverlayTransform({
      placements: this.options.placements(),
      ids,
      type,
      dx: event.dx,
      dy: event.dy,
      overlayBox: this.options.overlayBox(),
      getRenderedSize: this.options.getRenderedSize,
      minScale: this.options.minScale(),
      maxScale: this.options.maxScale(),
    });

    if (updated) {
      this.options.commitPlacements(updated);
    }
  }

  private applyCommandResult(result: StickerCanvasCommandResult | null): void {
    if (!result) return;

    if (result.deleteIds) {
      this.removePlacements(result.deleteIds);
      return;
    }

    if (result.enteringIds) {
      this.options.setEntering(result.enteringIds);
    }

    if (result.placements) {
      this.options.commitPlacements(result.placements);
    }

    if (result.settlingIds) {
      this.options.setSettling(result.settlingIds);
    }

    if (result.selection) {
      this.options.selectIds(result.selection.ids, result.selection.mode);
    }
  }

  private removePlacements(ids: string[]): void {
    if (!ids.length) return;

    this.options.clearSelection();
    const removed = new Set(ids);
    this.options.scheduleRemoval(ids, () => {
      this.options.emitPlacementsChanged(
        this.options.placements().filter(placement => !removed.has(placement.instanceId)),
      );
    });
  }
}
