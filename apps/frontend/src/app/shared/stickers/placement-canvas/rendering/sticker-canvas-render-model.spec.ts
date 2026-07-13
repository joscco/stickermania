import type {StickerDefinition, StickerPlacement} from "@birthday/shared";
import {setStickerIntrinsicSizeForTesting} from "../../model/sticker-intrinsic-size";
import {
  clampPlacementsToBounds,
  selectionCenter,
  selectionOverlayBox,
  selectionOverlayGeometry,
  stickerCatalogMap,
  stickerAnchor,
  stickerLeft,
  stickerTop,
  stickerWidth,
} from "./sticker-canvas-render-model";

describe("sticker-canvas-render-model", () => {
  it("indexes sticker definitions by id", () => {
    const first = stickerDefinition({id: "first"});
    const second = stickerDefinition({id: "second"});

    expect(stickerCatalogMap([first, second])).toEqual(new Map([
      ["first", first],
      ["second", second],
    ]));
  });

  it("builds a combined selection overlay box from selected placements only", () => {
    const catalog = new Map<string, StickerDefinition>([["sticker", stickerDefinition()]]);
    const placements = [
      placement({instanceId: "a", x: 100, y: 100, scale: 1}),
      placement({instanceId: "b", x: 300, y: 100, scale: 0.5}),
      placement({instanceId: "ignored", x: 1000, y: 1000, scale: 1}),
    ];

    expect(selectionOverlayBox(placements, ["a", "b"], catalog, 200)).toEqual({
      x: 0,
      y: 0,
      w: 350,
      h: 200,
    });
  });

  it("calculates the selection center across existing selected placements", () => {
    const placements = [
      placement({instanceId: "a", x: 100, y: 40}),
      placement({instanceId: "b", x: 300, y: 80}),
      placement({instanceId: "ignored", x: 900, y: 900}),
    ];

    expect(selectionCenter(placements, ["a", "b"], "x")).toBe(200);
    expect(selectionCenter(placements, ["a", "b"], "y")).toBe(60);
    expect(selectionCenter(placements, ["missing"], "x")).toBe(0);
  });

  it("clamps all or selected placements to placement bounds", () => {
    const placements = [
      placement({instanceId: "a", x: -20, y: 130}),
      placement({instanceId: "b", x: 140, y: -30}),
    ];

    expect(clampPlacementsToBounds(placements, {minX: 0, minY: 0, maxX: 100, maxY: 100}, ["a"])).toEqual([
      {...placements[0], x: 0, y: 100},
      placements[1],
    ]);

    expect(clampPlacementsToBounds(placements, {minX: 0, minY: 0, maxX: 100, maxY: 100})).toEqual([
      {...placements[0], x: 0, y: 100},
      {...placements[1], x: 100, y: 0},
    ]);
  });

  it("uses overlay bounds for sticker image positioning and transform origin", () => {
    const definition = stickerDefinition({overlayBounds: {x: 0.25, y: 0.75, w: 0.5, h: 0.25}});
    const renderedSize = {width: 200, height: 200};
    const selectedPlacement = placement({x: 100, y: 80});

    expect(stickerAnchor(selectedPlacement, definition, renderedSize)).toBe("50px 150px");
    expect(stickerLeft(selectedPlacement, definition, renderedSize)).toBe(50);
    expect(stickerTop(selectedPlacement, definition, renderedSize)).toBe(-70);
  });

  it("uses raster intrinsic dimensions instead of falling back to a square", () => {
    setStickerIntrinsicSizeForTesting("raster", {width: 720, height: 985});

    expect(stickerWidth(
      new Map<string, StickerDefinition>([["raster", stickerDefinition({id: "raster", imageUrl: "/assets/default-stickers/dev-default-grapes.png"})]]),
      "raster",
      200,
    )).toBe(146);

    setStickerIntrinsicSizeForTesting("raster", null);
  });

  it("does not inflate alpha-derived overlay bounds to a fixed minimum size", () => {
    const catalog = new Map<string, StickerDefinition>([["sticker", stickerDefinition()]]);
    const geometry = selectionOverlayGeometry(
      [placement({x: 100, y: 100})],
      ["placement"],
      catalog,
      200,
      () => ({x: 0.45, y: 0.45, w: 0.1, h: 0.05}),
    );

    expect(geometry?.box.w).toBeCloseTo(28);
    expect(geometry?.box.h).toBeCloseTo(18);
  });

  it("uses saved overlay bounds while alpha bounds are unavailable", () => {
    const catalog = new Map<string, StickerDefinition>([[
      "sticker",
      stickerDefinition({overlayBounds: {x: 0.5, y: 0.5, w: 0.2, h: 0.1}}),
    ]]);
    const geometry = selectionOverlayGeometry(
      [placement({x: 100, y: 100})],
      ["placement"],
      catalog,
      200,
      () => null,
    );

    expect(geometry?.box.x).toBeCloseTo(76);
    expect(geometry?.box.y).toBeCloseTo(86);
    expect(geometry?.box.w).toBeCloseTo(48);
    expect(geometry?.box.h).toBeCloseTo(28);
  });
});

function stickerDefinition(overrides: Partial<StickerDefinition> = {}): StickerDefinition {
  return {
    id: "sticker",
    imageUrl: "sprite:#sticker",
    ...overrides,
  };
}

function placement(overrides: Partial<StickerPlacement> = {}): StickerPlacement {
  return {
    instanceId: "placement",
    stickerId: "sticker",
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    zIndex: 1,
    ...overrides,
  };
}
