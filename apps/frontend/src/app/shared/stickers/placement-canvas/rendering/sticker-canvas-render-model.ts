import type {StickerDefinition, StickerPlacement} from "@birthday/shared";
import * as stickerTransformer from "./sticker-transform.util";
import {BoundingBox, Point} from '../../model/types';

export type PlacementBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type SelectionOverlayGeometry = {
  box: BoundingBox;
  rotationOrigin: Point | null;
};

export function stickerCatalogMap(stickers: StickerDefinition[]): Map<string, StickerDefinition> {
  return new Map(stickers.map(sticker => [sticker.id, sticker]));
}

export function stickerUrl(catalog: Map<string, StickerDefinition>, stickerId: string): string {
  return catalog.get(stickerId)?.imageUrl ?? "";
}

export function stickerRenderedSize(
  placements: StickerPlacement[],
  catalog: Map<string, StickerDefinition>,
  stickerSizePx: number,
  instanceId: string,
): { width: number; height: number } {
  const placement = placements.find(sticker => sticker.instanceId === instanceId);

  return stickerTransformer.stickerRenderedSize(
    placement,
    placement ? catalog.get(placement.stickerId) : undefined,
    stickerSizePx,
  );
}

export function stickerWidth(
  catalog: Map<string, StickerDefinition>,
  stickerId: string,
  stickerSizePx: number,
): number {
  return stickerTransformer.stickerRenderedSize(null, catalog.get(stickerId), stickerSizePx).width;
}

export function stickerTransform(placement: StickerPlacement): string {
  return stickerTransformer.stickerTransform(placement);
}

export function stickerAnchor(
  placement: StickerPlacement,
  definition: StickerDefinition | undefined,
  renderedSize: { width: number; height: number },
): string {
  const overlayBounds = definition?.overlayBounds;
  if (!overlayBounds) {
    return "50% 50%";
  }

  return `${overlayBounds.x * renderedSize.width}px ${overlayBounds.y * renderedSize.height}px`;
}

export function stickerLeft(
  placement: StickerPlacement,
  definition: StickerDefinition | undefined,
  renderedSize: { width: number; height: number },
): number {
  const overlayBounds = definition?.overlayBounds;
  if (!overlayBounds) {
    return placement.x - 0.5 * renderedSize.width;
  }

  return placement.x - overlayBounds.x * renderedSize.width;
}

export function stickerTop(
  placement: StickerPlacement,
  definition: StickerDefinition | undefined,
  renderedSize: { width: number; height: number },
): number {
  const overlayBounds = definition?.overlayBounds;
  if (!overlayBounds) {
    return placement.y - 0.5 * renderedSize.height;
  }

  return placement.y - overlayBounds.y * renderedSize.height;
}

export function selectionOverlayBox(
  placements: StickerPlacement[],
  selectionIds: string[],
  catalog: Map<string, StickerDefinition>,
  stickerSizePx: number,
): BoundingBox | null {
  return selectionOverlayGeometry(placements, selectionIds, catalog, stickerSizePx, () => null)?.box ?? null;
}

export function selectionOverlayGeometry(
  placements: StickerPlacement[],
  selectionIds: string[],
  catalog: Map<string, StickerDefinition>,
  stickerSizePx: number,
  getBounds: (stickerId: string) => BoundingBox | null,
): SelectionOverlayGeometry | null {
  const selected = placements.filter(sticker => selectionIds.includes(sticker.instanceId));
  if (!selected.length) return null;

  if (selected.length === 1) {
    const placement = selected[0];
    const geometry = stickerTransformer.overlayGeometry(
      placement,
      catalog.get(placement.stickerId),
      stickerSizePx,
      getBounds(placement.stickerId),
    );
    if (!geometry) return null;
    return {
      box: geometry.box,
      rotationOrigin: geometry.rotationOrigin,
    };
  }

  const boxes = selected
    .map(sticker => stickerTransformer.overlayBox(sticker, catalog.get(sticker.stickerId), stickerSizePx))
    .filter((box): box is BoundingBox => !!box);
  if (!boxes.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.w > maxX) maxX = box.x + box.w;
    if (box.y + box.h > maxY) maxY = box.y + box.h;
  }

  return {
    box: {x: minX, y: minY, w: maxX - minX, h: maxY - minY},
    rotationOrigin: null,
  };
}

export function selectionCenter(
  placements: StickerPlacement[],
  selectionIds: string[],
  axis: "x" | "y",
): number {
  if (!selectionIds.length) return 0;

  const selected = placements.filter(placement => selectionIds.includes(placement.instanceId));
  if (!selected.length) return 0;

  return selected.reduce((sum, placement) => sum + placement[axis], 0) / selected.length;
}

export function clampPlacementsToBounds(
  placements: StickerPlacement[],
  bounds: PlacementBounds | null,
  ids?: string[],
): StickerPlacement[] {
  if (!bounds) return placements;

  const targetIds = ids ? new Set(ids) : null;
  return placements.map(placement => {
    if (targetIds && !targetIds.has(placement.instanceId)) return placement;

    return {
      ...placement,
      x: Math.max(bounds.minX, Math.min(bounds.maxX, placement.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, placement.y)),
    };
  });
}
