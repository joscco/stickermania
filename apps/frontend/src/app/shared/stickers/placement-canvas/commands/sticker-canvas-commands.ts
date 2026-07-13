import type {StickerPlacement} from "@birthday/shared";
import * as ops from "../../model/sticker-placement-ops";
import {ActionBarAction} from '../sticker-action-bar/sticker-action-bar.component';
import {BoundingBox} from '../../model/types';

export type StickerCanvasSelectionCommand = {
  ids: string[];
  mode: "auto" | "multi";
};

export type StickerCanvasCommandResult = {
  placements?: StickerPlacement[];
  deleteIds?: string[];
  selection?: StickerCanvasSelectionCommand;
  enteringIds?: string[];
  settlingIds?: string[];
};

export type StickerCanvasActionCommandOptions = {
  action: ActionBarAction;
  placements: StickerPlacement[];
  ids: string[];
};

export type StickerCanvasOverlayTransformType = "scale" | "n" | "s" | "e" | "w";

export type StickerCanvasOverlayTransformOptions = {
  placements: StickerPlacement[];
  ids: string[];
  type: StickerCanvasOverlayTransformType;
  dx: number;
  dy: number;
  overlayBox: BoundingBox | null;
  getRenderedSize: (id: string) => { width: number; height: number };
  minScale: number;
  maxScale: number;
};

export function applyStickerCanvasActionCommand(
  options: StickerCanvasActionCommandOptions,
): StickerCanvasCommandResult | null {
  const {action, placements, ids} = options;
  if (!ids.length) return null;

  switch (action) {
    case "delete":
      return {deleteIds: ids};
    case "flipH":
      return {
        placements: flipPlacementsH(placements, ids),
        settlingIds: ids,
      };
    case "zForward":
      return {placements: ops.swapZ(placements, ids, +1)};
    case "zBackward":
      return {placements: ops.swapZ(placements, ids, -1)};
    case "zFront":
      return {placements: ops.moveToEdge(placements, ids, "front")};
    case "zBack":
      return {placements: ops.moveToEdge(placements, ids, "back")};
    case "duplicate": {
      const {updated, newIds} = ops.duplicatePlacements(placements, ids);
      return {
        placements: updated,
        selection: {ids: newIds, mode: "auto"},
        enteringIds: newIds,
      };
    }
    case "lock":
      return {
        placements: lockPlacements(placements, ids),
        selection: {ids: [], mode: "auto"},
      };
    case "reset":
      return {
        placements: resetPlacements(placements, ids),
        settlingIds: ids,
      };
    case "unlock":
    case "close":
      return null;
  }
}

export function applyStickerCanvasOverlayTransform(
  options: StickerCanvasOverlayTransformOptions,
): StickerPlacement[] | null {
  const {placements, ids, type, dx, dy, overlayBox, getRenderedSize, minScale, maxScale} = options;
  if (!ids.length) return null;

  if (type === "scale") {
    if (!overlayBox || overlayBox.w <= 0 || overlayBox.h <= 0) {
      return null;
    }

    const half = Math.max(overlayBox.w, overlayBox.h) / 2;
    const delta = (dx + dy) / 2;
    const scaleFactor = (half + delta) / half;

    return ids.length === 1
      ? ops.scaleSingle(placements, ids[0], scaleFactor, minScale, maxScale)
      : ops.applyGroupTransform(placements, ids, 0, scaleFactor, null, minScale, maxScale);
  }

  if (ids.length !== 1) {
    return null;
  }

  return ops.applyStretchHandle(
    placements,
    ids[0],
    type,
    dx,
    dy,
    getRenderedSize,
    minScale,
    maxScale,
  );
}

export function isStickerCanvasOverlayTransformType(type: string): type is StickerCanvasOverlayTransformType {
  return type === "scale" || type === "n" || type === "s" || type === "e" || type === "w";
}

export function resetPlacements(placements: StickerPlacement[], ids: string[]): StickerPlacement[] {
  return placements.map(placement =>
    ids.includes(placement.instanceId)
      ? {
        ...placement,
        scale: 1,
        rotation: 0,
        scaleX: undefined,
        scaleY: undefined,
        flipX: false,
        flipY: false,
      }
      : placement);
}

export function flipPlacementsH(placements: StickerPlacement[], ids: string[]): StickerPlacement[] {
  return ids.length === 1
    ? ops.mirrorSingle(placements, ids[0], "h")
    : ops.applyGroupTransform(placements, ids, 0, 1, "h");
}


export function lockPlacements(placements: StickerPlacement[], ids: string[]): StickerPlacement[] {
  const lockedIds = new Set(ids);
  return placements.map(placement => lockedIds.has(placement.instanceId)
    ? {...placement, locked: true} as StickerPlacement
    : placement);
}
