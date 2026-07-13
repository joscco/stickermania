import {StickerBoardCameraController, type StickerBoardCameraProfile} from "./sticker-board-camera.controller";
import type {BoardBounds, StickerBoardViewConfig} from "../geometry/sticker-board-types";
import {describe, expect, it} from "vitest";

describe("StickerBoardCameraController", () => {
  const bounds: BoardBounds = {minX: -100, minY: -50, maxX: 100, maxY: 50};
  const view: StickerBoardViewConfig = {
    stickerBaseSize: 200,
    minStickerScale: 0.25,
    maxStickerScale: 1.5,
    viewMinZoom: 0.2,
    viewMaxZoom: 5,
    editMinZoom: 1,
    editMaxZoom: 5,
    editFitZoomMultiplier: 2,
  };

  it("initializes a centered view camera for the viewport", () => {
    const camera = cameraController();

    camera.setViewportSize(400, 200);

    expect(camera.zoom()).toBe(1);
    expect(camera.panX()).toBe(100);
    expect(camera.panY()).toBe(50);
    expect(camera.boardPointAtViewportPoint({x: 200, y: 100})).toEqual({x: 0, y: 0});
  });

  it("allows the view camera to zoom out to the full-board fit below the configured minimum", () => {
    const camera = cameraController();

    camera.setViewportSize(20, 10);

    expect(camera.zoom()).toBeCloseTo(0.1);
    expect(camera.boardPointAtViewportPoint({x: 10, y: 5})).toEqual({x: 0, y: 0});
  });

  it("preserves the board point under the cursor while wheel-zooming", () => {
    const camera = cameraController();
    const point = {x: 250, y: 100};
    camera.setViewportSize(400, 200);

    const before = camera.boardPointAtViewportPoint(point);

    camera.wheelAtViewportPoint(point, -100);

    const after = camera.boardPointAtViewportPoint(point);
    expect(camera.zoom()).toBeGreaterThan(1);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("pans while a single pointer moves", () => {
    const camera = cameraController();
    camera.setViewportSize(400, 200);

    camera.startPointer(1, {x: 20, y: 20});
    expect(camera.isPanning()).toBe(true);

    expect(camera.movePointer(1, {x: 50, y: 70})).toBe(true);
    expect(camera.panX()).toBe(130);
    expect(camera.panY()).toBe(100);

    camera.endPointer(1);
    expect(camera.isPanning()).toBe(false);
  });

  it("returns the applied delta when panning programmatically", () => {
    const camera = cameraController();
    camera.setViewportSize(400, 200);

    const applied = camera.panBy(20, -10);

    expect(applied).toEqual({x: 20, y: -10});
    expect(camera.panX()).toBe(120);
    expect(camera.panY()).toBe(40);
  });

  it("tracks active pointer gestures across pan and pinch", () => {
    const camera = cameraController();
    camera.setViewportSize(400, 200);

    expect(camera.isGestureActive()).toBe(false);

    camera.startPointer(1, {x: 150, y: 100});
    expect(camera.isGestureActive()).toBe(true);

    camera.startPointer(2, {x: 250, y: 100});
    camera.endPointer(1);
    expect(camera.isGestureActive()).toBe(true);

    camera.endPointer(2);
    expect(camera.isGestureActive()).toBe(false);
  });

  it("pinch-zooms around the pinch center", () => {
    const camera = cameraController();
    camera.setViewportSize(400, 200);

    camera.startPointer(1, {x: 150, y: 100});
    camera.startPointer(2, {x: 250, y: 100});

    const before = camera.boardPointAtViewportPoint({x: 200, y: 100});

    expect(camera.movePointer(2, {x: 350, y: 100})).toBe(true);

    const after = camera.boardPointAtViewportPoint({x: 250, y: 100});
    expect(camera.zoom()).toBeCloseTo(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("applies profile changes after initialization", () => {
    let profile: StickerBoardCameraProfile = "view";
    const camera = cameraController(() => profile);
    camera.setViewportSize(400, 200);

    profile = "edit";

    expect(camera.applyProfileIfChanged(false)).toBe(true);
    expect(camera.zoom()).toBe(2);
  });

  function cameraController(profile: () => StickerBoardCameraProfile = () => "view"): StickerBoardCameraController {
    return new StickerBoardCameraController({
      bounds,
      view,
      contentPaddingPx: () => 0,
      cameraOverscrollPx: () => 180,
      profile,
    });
  }
});
