import type {BoardStickerPlacement, StickerDefinition} from "@birthday/shared";
import {describe, expect, it} from "vitest";
import {buildPlacementLabels} from "./sticker-board-label-layout";
import type {BoardBounds} from "../geometry/sticker-board-types";
import {setStickerIntrinsicSizeForTesting} from "../../model/sticker-intrinsic-size";

describe("sticker-board-label-layout", () => {
  const bounds: BoardBounds = {minX: -1000, minY: -1000, maxX: 1000, maxY: 1000};
  const stickerCatalog: StickerDefinition[] = [{id: "sticker", imageUrl: "sprite:#sticker"}];

  it("creates one avatar badge per placement with badge data", () => {
    const labels = buildPlacementLabels({
      placements: [
        placement({instanceId: "a", x: 0, y: 0}),
        placement({instanceId: "without-badge", x: 300, y: 300}),
      ],
      stickerCatalog,
      placementBadges: {
        a: {name: "Jonathan", avatarUrl: "/avatar.png"},
      },
      bounds,
      boardWidth: 2000,
      boardHeight: 2000,
      stickerBaseSize: 200,
    });

    expect(labels).toHaveLength(1);
    expect(labels[0]).toEqual(expect.objectContaining({
      instanceId: "a",
      name: "Jonathan",
      avatarUrl: "/avatar.png",
    }));
    expect(labels[0].centerX).toBeGreaterThanOrEqual(17);
    expect(labels[0].centerX).toBeLessThanOrEqual(1983);
    expect(labels[0].centerY).toBeGreaterThanOrEqual(17);
    expect(labels[0].centerY).toBeLessThanOrEqual(1983);
    expect(Number.isFinite(labels[0].arrowRotation)).toBe(true);
  });

  it("does not group nearby placements anymore", () => {
    const labels = buildPlacementLabels({
      placements: [
        placement({instanceId: "a", x: 0, y: 0}),
        placement({instanceId: "b", x: 100, y: 50}),
      ],
      stickerCatalog,
      placementBadges: {
        a: {name: "Mila", avatarUrl: null},
        b: {name: "Mila", avatarUrl: null},
      },
      bounds,
      boardWidth: 2000,
      boardHeight: 2000,
      stickerBaseSize: 200,
    });

    expect(labels.map(label => label.instanceId)).toEqual(["a", "b"]);
  });

  it("varies badge positions by placement id", () => {
    const labels = buildPlacementLabels({
      placements: [
        placement({instanceId: "badge-a", x: 0, y: 0}),
        placement({instanceId: "badge-b", x: 0, y: 0}),
      ],
      stickerCatalog,
      placementBadges: {
        "badge-a": {name: "Mila", avatarUrl: null},
        "badge-b": {name: "Mila", avatarUrl: null},
      },
      bounds,
      boardWidth: 2000,
      boardHeight: 2000,
      stickerBaseSize: 200,
    });

    expect(new Set(labels.map(label => `${label.centerX}:${label.centerY}`)).size).toBeGreaterThan(1);
  });

  it("prefers badge positions that do not cover other stickers", () => {
    const labels = buildPlacementLabels({
      placements: [
        placement({instanceId: "b", x: 0, y: 0}),
        placement({instanceId: "other", x: 132, y: 0}),
      ],
      stickerCatalog,
      placementBadges: {
        b: {name: "Mila", avatarUrl: null},
      },
      bounds,
      boardWidth: 2000,
      boardHeight: 2000,
      stickerBaseSize: 200,
    });

    expect(labels).toHaveLength(1);
    expect(labels[0].centerX).not.toBe(1132);
    expect(labels[0].centerY).not.toBe(1000);
  });

  it("uses the directional overlay-box dimension for wide stickers", () => {
    const wideSticker: StickerDefinition = {id: "wide", imageUrl: "/wide.png"};
    setStickerIntrinsicSizeForTesting("wide", {width: 400, height: 100});

    const labels = buildPlacementLabels({
      placements: [
        placement({instanceId: "aa", stickerId: "wide", x: 0, y: 0}),
      ],
      stickerCatalog: [wideSticker],
      placementBadges: {
        aa: {name: "Mila", avatarUrl: null},
      },
      bounds,
      boardWidth: 2000,
      boardHeight: 2000,
      stickerBaseSize: 200,
    });

    setStickerIntrinsicSizeForTesting("wide", null);

    expect(labels).toHaveLength(1);
    expect(labels[0].centerY).toBeGreaterThan(800);
  });
});

function placement(overrides: Partial<BoardStickerPlacement> = {}): BoardStickerPlacement {
  return {
    instanceId: "placement",
    stickerId: "sticker",
    ownerPlayerId: "player",
    placedByPlayerId: "player",
    updatedAt: 1,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    zIndex: 1,
    ...overrides,
  };
}
