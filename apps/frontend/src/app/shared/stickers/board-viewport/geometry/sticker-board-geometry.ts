import {type BoardStickerPlacement, type StickerPlacement} from "@stickermania/shared";
import type {BoardBounds, BoardPoint} from "./sticker-board-types";
export {wheelZoomFactor} from "../../../input/wheel-zoom";

export function boardWidth(bounds: BoardBounds): number {
  return bounds.maxX - bounds.minX;
}

export function boardHeight(bounds: BoardBounds): number {
  return bounds.maxY - bounds.minY;
}

export function viewportPointFromClient(rect: DOMRect, clientX: number, clientY: number): BoardPoint {
  return {x: clientX - rect.left, y: clientY - rect.top};
}

export function boardToDisplayPlacements(
  placements: BoardStickerPlacement[],
  bounds: BoardBounds,
  zoom: number,
): BoardStickerPlacement[] {
  return placements.map(placement => ({
    ...placement,
    x: (placement.x - bounds.minX) * zoom,
    y: (placement.y - bounds.minY) * zoom,
  }));
}

export function displayToBoardPlacements(
  placements: StickerPlacement[],
  bounds: BoardBounds,
  zoom: number,
): BoardStickerPlacement[] {
  return placements.map(placement => ({
    ...(placement as BoardStickerPlacement),
    x: placement.x / zoom + bounds.minX,
    y: placement.y / zoom + bounds.minY,
  }));
}
