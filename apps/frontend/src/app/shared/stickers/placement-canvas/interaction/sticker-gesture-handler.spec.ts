import type {StickerPlacement} from "@stickermania/shared";
import {describe, expect, it} from "vitest";
import {CanvasSelectionState} from "../state/canvas-selection.state";
import {StickerGestureHandler} from "./sticker-gesture-handler";

describe("StickerGestureHandler", () => {
  it("nudges an active move without changing the pointer baseline", () => {
    let placements = [placement({x: 20, y: 30})];
    const selection = new CanvasSelectionState();
    const emitted: StickerPlacement[][] = [];
    const gesture = new StickerGestureHandler(
      () => ({left: 0, top: 0, width: 400, height: 300}) as DOMRect,
      () => "placement",
      {
        onPlacementsChanged: next => {
          placements = next;
          emitted.push(next);
        },
        onSelectedChanged: id => selection.selectIds(id ? [id] : []),
      },
    );

    gesture.syncState(placements, selection);
    expect(gesture.onPointerDown(1, 40, 50)).toBe(true);

    gesture.onPointerMove(1, 50, 60);
    expect(placements[0]).toMatchObject({x: 30, y: 40});

    gesture.nudgeActiveMove(-12, 6);
    expect(placements[0]).toMatchObject({x: 18, y: 46});

    gesture.syncState(placements, selection);
    gesture.onPointerMove(1, 50, 60);

    expect(placements[0]).toMatchObject({x: 30, y: 40});
    expect(emitted.length).toBeGreaterThanOrEqual(3);
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
