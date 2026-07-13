import {afterEach, describe, expect, it, vi} from "vitest";

import {CanvasViewportController} from "./canvas-viewport.controller";

describe("CanvasViewportController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resizes the canvas once and reports the previous size", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const redraw = vi.fn();
    const onResize = vi.fn();
    const controller = new CanvasViewportController({
      redraw,
      onResize,
      pixelRatio: () => 2,
    });
    const frame = elementWithRect(document.createElement("div"), {left: 0, top: 0, width: 200, height: 100});
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 150;

    controller.setCanvasFrame({nativeElement: frame});
    controller.setSourceCanvas({nativeElement: canvas});
    expect(frames).toHaveLength(1);

    frames[0](0);

    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
    expect(onResize).toHaveBeenCalledWith(expect.objectContaining({
      previousWidth: 300,
      previousHeight: 150,
      width: 400,
      height: 200,
    }));
    expect(redraw).toHaveBeenCalledOnce();
  });

  it("converts client coordinates into canvas coordinates", () => {
    const controller = new CanvasViewportController({redraw: vi.fn()});
    const canvas = elementWithRect(document.createElement("canvas"), {left: 10, top: 20, width: 200, height: 100});
    canvas.width = 400;
    canvas.height = 200;
    controller.setSourceCanvas({nativeElement: canvas});

    expect(controller.canvasPointFromClient(110, 70)).toEqual({x: 200, y: 100});
  });

  it("runs a requested fit instead of an extra redraw", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    }));

    const redraw = vi.fn();
    const fit = vi.fn();
    const controller = new CanvasViewportController({redraw, fit});
    controller.setSourceCanvas({nativeElement: document.createElement("canvas")}, true);

    frames[0](0);

    expect(fit).toHaveBeenCalledOnce();
    expect(redraw).not.toHaveBeenCalled();
  });
});

function elementWithRect<TElement extends HTMLElement>(
  element: TElement,
  rect: {left: number; top: number; width: number; height: number},
): TElement {
  element.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => undefined,
  });
  return element;
}
