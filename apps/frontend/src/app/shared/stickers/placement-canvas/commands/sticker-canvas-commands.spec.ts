import type {StickerPlacement} from "@stickermania/shared";
import {describe, expect, it} from "vitest";
import {
  applyStickerCanvasActionCommand,
  applyStickerCanvasOverlayTransform,
  flipPlacementsH,
  resetPlacements,
} from "./sticker-canvas-commands";

describe("sticker-canvas-commands", () => {
  it("resets selected placements to their base transform", () => {
    const placements = [
      placement({instanceId: "a", scale: 2, rotation: 45, scaleX: 1.5, scaleY: 0.7, flipX: true, flipY: true}),
      placement({instanceId: "b", scale: 3, rotation: 90}),
    ];

    expect(resetPlacements(placements, ["a"])).toEqual([
      {...placements[0], scale: 1, rotation: 0, scaleX: undefined, scaleY: undefined, flipX: false, flipY: false},
      placements[1],
    ]);
  });

  it("maps action-bar duplicate actions to command results", () => {
    const placements = [
      placement({instanceId: "a", x: 10, y: 20, zIndex: 1}),
      placement({instanceId: "b", x: 30, y: 40, zIndex: 2}),
    ];

    const duplicateResult = applyStickerCanvasActionCommand({
      action: "duplicate",
      placements,
      ids: ["a"],
    });

    expect(duplicateResult?.enteringIds).toHaveLength(1);
    expect(duplicateResult?.selection).toEqual({ids: duplicateResult?.enteringIds, mode: "auto"});
    expect(duplicateResult?.placements).toHaveLength(3);
    expect(duplicateResult?.placements?.[2]).toMatchObject({stickerId: "sticker", x: 26, y: 36, zIndex: 3});
  });

  it("maps action-bar flip and delete actions to command results", () => {
    const placements = [placement({instanceId: "a", flipX: false})];

    expect(flipPlacementsH(placements, ["a"])[0].flipX).toBe(true);
    expect(applyStickerCanvasActionCommand({action: "delete", placements, ids: ["a"]})).toEqual({deleteIds: ["a"]});
    expect(applyStickerCanvasActionCommand({action: "reset", placements, ids: []})).toBeNull();
  });

  it("normalizes z-order when moving stickers to the back", () => {
    const placements = [
      placement({instanceId: "a", zIndex: 0}),
      placement({instanceId: "b", zIndex: 1}),
      placement({instanceId: "c", zIndex: 2}),
    ];

    const result = applyStickerCanvasActionCommand({
      action: "zBack",
      placements,
      ids: ["c"],
    });

    expect(result?.placements?.map(item => [item.instanceId, item.zIndex])).toEqual([
      ["a", 2],
      ["b", 3],
      ["c", 1],
    ]);
  });

  it("moves a sticker backward without being blocked by zIndex zero", () => {
    const placements = [
      placement({instanceId: "a", zIndex: 0}),
      placement({instanceId: "b", zIndex: 1}),
      placement({instanceId: "c", zIndex: 2}),
    ];

    const result = applyStickerCanvasActionCommand({
      action: "zBackward",
      placements,
      ids: ["b"],
    });

    expect(result?.placements?.map(item => [item.instanceId, item.zIndex])).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 3],
    ]);
  });

  it("removes duplicate zero z-indices during z-order actions", () => {
    const placements = [
      placement({instanceId: "a", zIndex: 0}),
      placement({instanceId: "b", zIndex: 0}),
    ];

    const result = applyStickerCanvasActionCommand({
      action: "zBackward",
      placements,
      ids: ["b"],
    });

    expect(result?.placements?.map(item => [item.instanceId, item.zIndex])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
    expect(new Set(result?.placements?.map(item => item.zIndex)).size).toBe(2);
  });

  it("keeps moving a sticker backward through initially duplicated zero z-indices", () => {
    const placements = [
      placement({instanceId: "a", zIndex: 0}),
      placement({instanceId: "b", zIndex: 0}),
      placement({instanceId: "c", zIndex: 0}),
    ];

    const firstStep = applyStickerCanvasActionCommand({
      action: "zBackward",
      placements,
      ids: ["c"],
    })?.placements;
    const secondStep = applyStickerCanvasActionCommand({
      action: "zBackward",
      placements: firstStep ?? [],
      ids: ["c"],
    })?.placements;

    expect(firstStep?.map(item => [item.instanceId, item.zIndex])).toEqual([
      ["a", 1],
      ["b", 3],
      ["c", 2],
    ]);
    expect(secondStep?.map(item => [item.instanceId, item.zIndex])).toEqual([
      ["a", 2],
      ["b", 3],
      ["c", 1],
    ]);
    expect(new Set(secondStep?.map(item => item.zIndex)).size).toBe(3);
  });

  it("applies overlay scale transforms for single and multi selections", () => {
    const placements = [
      placement({instanceId: "a", x: 0, y: 0, scale: 1}),
      placement({instanceId: "b", x: 100, y: 0, scale: 1}),
    ];

    const single = applyStickerCanvasOverlayTransform({
      placements,
      ids: ["a"],
      type: "scale",
      dx: 50,
      dy: 50,
      overlayBox: {x: 0, y: 0, w: 100, h: 100},
      getRenderedSize: () => ({width: 100, height: 100}),
      minScale: 0.2,
      maxScale: 4,
    });

    expect(single?.[0].scale).toBe(2);

    const multi = applyStickerCanvasOverlayTransform({
      placements,
      ids: ["a", "b"],
      type: "scale",
      dx: 50,
      dy: 50,
      overlayBox: {x: 0, y: 0, w: 100, h: 100},
      getRenderedSize: () => ({width: 100, height: 100}),
      minScale: 0.2,
      maxScale: 4,
    });

    expect(multi?.map(item => item.scale)).toEqual([2, 2]);
    expect(multi?.map(item => item.x)).toEqual([-50, 150]);
  });

  it("applies overlay stretch transforms only to single selections", () => {
    const placements = [placement({instanceId: "a", scale: 1})];
    const getRenderedSize = () => ({width: 100, height: 100});

    const stretched = applyStickerCanvasOverlayTransform({
      placements,
      ids: ["a"],
      type: "e",
      dx: 50,
      dy: 0,
      overlayBox: null,
      getRenderedSize,
      minScale: 0.2,
      maxScale: 4,
    });

    expect(stretched?.[0].scaleX).toBe(2);

    expect(applyStickerCanvasOverlayTransform({
      placements,
      ids: ["a", "b"],
      type: "e",
      dx: 50,
      dy: 0,
      overlayBox: null,
      getRenderedSize,
      minScale: 0.2,
      maxScale: 4,
    })).toBeNull();
  });
});

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
