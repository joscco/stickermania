import type {StickerBoardBoundsConfig} from "@birthday/shared";
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";

export type BoardPoint = {x: number; y: number};

export interface StickerBoardViewConfig {
  // STICKERS
  stickerBaseSize: number;
  minStickerScale: number;
  maxStickerScale: number;

  // VIEW
  viewMinZoom: number;
  viewMaxZoom: number;
  editMinZoom: number;
  editMaxZoom: number;
  // How much nearer is the edit Zoom in comparison to view
  editFitZoomMultiplier: number;
}

export const BOARD_VIEW_CONFIG: StickerBoardViewConfig = {
  stickerBaseSize: STICKERMANIA_CONFIG.board.stickerBaseSizePx,
  viewMinZoom: STICKERMANIA_CONFIG.board.viewMinZoom,
  viewMaxZoom: STICKERMANIA_CONFIG.board.viewMaxZoom,
  editMinZoom: STICKERMANIA_CONFIG.board.editMinZoom,
  editMaxZoom: STICKERMANIA_CONFIG.board.editMaxZoom,
  editFitZoomMultiplier: STICKERMANIA_CONFIG.board.editFitZoomMultiplier,
  minStickerScale: STICKERMANIA_CONFIG.board.minStickerScale,
  maxStickerScale: STICKERMANIA_CONFIG.board.maxStickerScale,
};

export type BoardBounds = StickerBoardBoundsConfig;

export const BOARD_BOUNDS: BoardBounds = {...STICKERMANIA_CONFIG.board.bounds};
