import type {BoardStickerPlacement} from "@birthday/shared";
import {
  boardHeight,
  boardToDisplayPlacements,
  boardWidth,
  displayToBoardPlacements,
  viewportPointFromClient,
  wheelZoomFactor,
} from "./sticker-board-geometry";
import type {BoardBounds} from "./sticker-board-types";

describe("sticker-board-geometry", () => {
  const bounds: BoardBounds = {minX: -100, minY: -50, maxX: 300, maxY: 150};

  it("calculates board dimensions from bounds", () => {
    expect(boardWidth(bounds)).toBe(400);
    expect(boardHeight(bounds)).toBe(200);
  });

  it("converts board placements into display coordinates and back", () => {
    const placement: BoardStickerPlacement = {
      instanceId: "a",
      stickerId: "s",
      ownerPlayerId: "p",
      placedByPlayerId: "p",
      updatedAt: 1,
      x: -50,
      y: 25,
      rotation: 7,
      scale: 1.2,
      zIndex: 3,
    };

    const displayPlacements = boardToDisplayPlacements([placement], bounds, 2);
    expect(displayPlacements[0]).toEqual({...placement, x: 100, y: 150});

    expect(displayToBoardPlacements(displayPlacements, bounds, 2)).toEqual([placement]);
  });

  it("maps client points into viewport-local points", () => {
    const rect = {left: 30, top: 40} as DOMRect;

    expect(viewportPointFromClient(rect, 45, 70)).toEqual({x: 15, y: 30});
  });

  it("calculates exponential wheel zoom factors", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it("preserves board metadata when converting from generic sticker placements", () => {
    const placement: BoardStickerPlacement = {
      instanceId: "a",
      stickerId: "s",
      ownerPlayerId: "p",
      placedByPlayerId: "p",
      updatedAt: 1,
      x: 200,
      y: 100,
      rotation: 0,
      scale: 1,
      zIndex: 1,
    };

    expect(displayToBoardPlacements([placement], bounds, 2)[0].ownerPlayerId).toBe("p");
  });
});
