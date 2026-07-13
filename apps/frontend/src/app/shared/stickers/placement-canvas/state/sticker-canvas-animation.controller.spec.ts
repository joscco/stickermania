import {vi} from "vitest";
import {StickerCanvasAnimationController} from "./sticker-canvas-animation.controller";

describe("StickerCanvasAnimationController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("clears entering animations after their presentation duration", () => {
    const emissions: Record<string, string>[] = [];
    const controller = new StickerCanvasAnimationController(states => emissions.push(states));

    controller.set("sticker", "entering");
    expect(controller.get("sticker")).toBe("entering");

    vi.advanceTimersByTime(280);

    expect(controller.get("sticker")).toBe("idle");
    expect(emissions.at(-1)).toEqual({});
  });

  it("keeps a newer animation when an older transient timer would finish", () => {
    const controller = new StickerCanvasAnimationController(() => undefined);
    controller.set("sticker", "entering");

    vi.advanceTimersByTime(100);
    controller.set("sticker", "settling");
    vi.advanceTimersByTime(180);

    expect(controller.get("sticker")).toBe("settling");
  });

  it("commits a removal after the rendered item reports completion", () => {
    let committed = false;
    const controller = new StickerCanvasAnimationController(() => undefined);
    controller.scheduleRemoval(["sticker"], () => {
      committed = true;
    });

    controller.onRemoved("sticker");

    expect(committed).toBe(true);
    expect(controller.get("sticker")).toBe("idle");
  });
});
