import {applyCropImageTransformCommand} from "./crop-image-transform.commands";
import type {ImageTransform} from "../shared/sticker-creator-types";

describe("applyCropImageTransformCommand", () => {
  const initialTransform: ImageTransform = {x: 100, y: 80, scale: 2, rotation: 0};
  const clampScale = (scale: number) => Math.max(0.5, Math.min(4, scale));

  it("moves the image by the pan delta", () => {
    expect(applyCropImageTransformCommand(initialTransform, {type: "panImage", deltaX: 12, deltaY: -5}, clampScale)).toEqual({
      x: 112,
      y: 75,
      scale: 2,
      rotation: 0,
    });
  });

  it("zooms around a point using the clamped scale", () => {
    expect(applyCropImageTransformCommand(initialTransform, {type: "zoomImage", point: {x: 50, y: 40}, factor: 3}, clampScale)).toEqual({
      x: 150,
      y: 120,
      scale: 4,
      rotation: 0,
    });
  });

  it("applies pinch movement from the original pinch transform", () => {
    expect(applyCropImageTransformCommand(initialTransform, {
      type: "pinchImage",
      startTransform: initialTransform,
      startCenter: {x: 20, y: 20},
      currentCenter: {x: 30, y: 50},
      scaleFactor: 1.5,
    }, clampScale)).toEqual({
      x: 150,
      y: 140,
      scale: 3,
      rotation: 0,
    });
  });
});
