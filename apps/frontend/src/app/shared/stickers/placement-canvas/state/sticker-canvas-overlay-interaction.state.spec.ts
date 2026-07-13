import {StickerCanvasOverlayInteractionState} from "./sticker-canvas-overlay-interaction.state";
import type {BoundingBox} from "../../model/types";

describe("StickerCanvasOverlayInteractionState", () => {
  it("freezes the overlay box while rotating", () => {
    const state = new StickerCanvasOverlayInteractionState();
    const initialBox: BoundingBox = {x: 0, y: 0, w: 100, h: 100};
    const recalculatedBox: BoundingBox = {x: 10, y: 20, w: 120, h: 130};

    expect(state.overlayBoxForSelection(["a"], () => initialBox)).toBe(initialBox);

    state.beginRotate(15, initialBox);

    expect(state.overlayBoxForSelection(["a"], () => recalculatedBox)).toBe(initialBox);
    expect(state.isRotating()).toBe(true);
    expect(state.accumulatedRotateDeg()).toBe(15);

    state.finishRotate();

    expect(state.overlayBoxForSelection(["a"], () => recalculatedBox)).toBe(recalculatedBox);
  });

  it("tracks pointer rotation deltas around the frozen overlay center", () => {
    const state = new StickerCanvasOverlayInteractionState();
    const box: BoundingBox = {x: 0, y: 0, w: 100, h: 100};
    const canvasRect = {left: 10, top: 20} as DOMRect;

    state.beginRotate(10, box);

    expect(state.rotationDeltaForPointer(box, canvasRect, 160, 70)).toBeNull();

    const delta = state.rotationDeltaForPointer(box, canvasRect, 60, 170);

    expect(delta).toBeCloseTo(90);
    expect(state.accumulatedRotateDeg()).toBeCloseTo(100);
  });

  it("clears frozen overlay data when selection disappears", () => {
    const state = new StickerCanvasOverlayInteractionState();
    const box: BoundingBox = {x: 0, y: 0, w: 100, h: 100};

    state.beginRotate(0, box);

    expect(state.overlayBoxForSelection([], () => box)).toBeNull();
    state.finishRotate();
    expect(state.overlayBoxForSelection(["a"], () => box)).toBe(box);
  });
});
