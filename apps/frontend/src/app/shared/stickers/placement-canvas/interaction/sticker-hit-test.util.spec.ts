import type {StickerPlacement} from "@birthday/shared";
import {hitTestOnCanvas, type StickerHitGeometry} from "./sticker-hit-test.util";

describe("hitTestOnCanvas", () => {
  const canvasRect = new DOMRect(0, 0, 400, 400);
  const placement: StickerPlacement = {
    instanceId: "a",
    stickerId: "sticker",
    x: 100,
    y: 100,
    rotation: 0,
    scale: 1,
    zIndex: 1,
  };
  const geometry: StickerHitGeometry = {
    width: 100,
    height: 100,
    pivotX: 50,
    pivotY: 50,
    bounds: {x: 0.25, y: 0.25, w: 0.5, h: 0.5},
  };

  it("uses alpha-derived bounds instead of the full image bounds", () => {
    expect(hitTestOnCanvas(100, 100, canvasRect, [placement], () => geometry)).toBe("a");
    expect(hitTestOnCanvas(60, 100, canvasRect, [placement], () => geometry)).toBeNull();
  });

  it("lets alpha bounds extend outside the image bounding box", () => {
    const outsetGeometry: StickerHitGeometry = {
      ...geometry,
      bounds: {x: -0.1, y: -0.1, w: 1.2, h: 1.2},
    };

    expect(hitTestOnCanvas(45, 45, canvasRect, [placement], () => outsetGeometry)).toBe("a");
  });

  it("falls back to the full rendered bounds when no alpha bounds are provided", () => {
    const fullBoundsGeometry: StickerHitGeometry = {
      ...geometry,
      bounds: null,
    };

    expect(hitTestOnCanvas(60, 100, canvasRect, [placement], () => fullBoundsGeometry)).toBe("a");
    expect(hitTestOnCanvas(40, 100, canvasRect, [placement], () => fullBoundsGeometry)).toBeNull();
  });

  it("prefers a lower-z preferred placement over a higher-z non-preferred placement", () => {
    const lockedTop = {...placement, instanceId: "locked-top", zIndex: 20, locked: true} as StickerPlacement & {locked: boolean};
    const unlockedBottom = {...placement, instanceId: "unlocked-bottom", zIndex: 10};

    expect(hitTestOnCanvas(
      100,
      100,
      canvasRect,
      [unlockedBottom, lockedTop],
      () => geometry,
      {preferPlacement: candidate => !(candidate as StickerPlacement & {locked?: boolean}).locked},
    )).toBe("unlocked-bottom");
  });

  it("falls back to z-index when only non-preferred placements overlap", () => {
    const lockedTop = {...placement, instanceId: "locked-top", zIndex: 20, locked: true} as StickerPlacement & {locked: boolean};
    const lockedBottom = {...placement, instanceId: "locked-bottom", zIndex: 10, locked: true} as StickerPlacement & {locked: boolean};

    expect(hitTestOnCanvas(
      100,
      100,
      canvasRect,
      [lockedBottom, lockedTop],
      () => geometry,
      {preferPlacement: candidate => !(candidate as StickerPlacement & {locked?: boolean}).locked},
    )).toBe("locked-top");
  });

  it("keeps z-index order among overlapping preferred placements", () => {
    const unlockedTop = {...placement, instanceId: "unlocked-top", zIndex: 20};
    const unlockedBottom = {...placement, instanceId: "unlocked-bottom", zIndex: 10};

    expect(hitTestOnCanvas(
      100,
      100,
      canvasRect,
      [unlockedBottom, unlockedTop],
      () => geometry,
      {preferPlacement: candidate => !(candidate as StickerPlacement & {locked?: boolean}).locked},
    )).toBe("unlocked-top");
  });
});
