import {describe, expect, it, vi} from "vitest";

import type {CanvasPoint} from "../shared/sticker-creator-types";
import {PaintToolInputController} from "./paint-tool-input.controller";

describe("PaintToolInputController", () => {
  it("defers a touch stroke until movement establishes paint intent", () => {
    const setup = createController();
    setup.controller.start(pointerEvent(1, "touch"), {x: 10, y: 10}, "brush");

    expect(setup.startStroke).not.toHaveBeenCalled();
    expect(setup.controller.move(1, {x: 12, y: 10})).toBe(true);
    expect(setup.startStroke).not.toHaveBeenCalled();

    setup.controller.move(1, {x: 20, y: 10});
    expect(setup.startStroke).toHaveBeenCalledWith(1, {x: 10, y: 10});
    expect(setup.continueStroke).toHaveBeenCalledWith(1, {x: 20, y: 10});
  });

  it("executes a deferred touch fill only when the pointer completes as a tap", () => {
    const setup = createController();
    setup.controller.start(pointerEvent(1, "touch"), {x: 10, y: 10}, "fill");
    setup.controller.complete(1);

    expect(setup.fillAt).toHaveBeenCalledWith({x: 10, y: 10});
  });

  it("distinguishes editing a text box from dragging it", () => {
    const tap = createController();
    tap.controller.start(pointerEvent(1, "mouse"), {x: 10, y: 10}, "text");
    tap.controller.complete(1);
    expect(tap.editActiveTextBox).toHaveBeenCalledOnce();

    const drag = createController();
    drag.controller.start(pointerEvent(1, "mouse"), {x: 10, y: 10}, "text");
    drag.controller.move(1, {x: 20, y: 10});
    drag.controller.complete(1);

    expect(drag.startTextBoxDrag).toHaveBeenCalledWith({x: 10, y: 10});
    expect(drag.continueTextBoxDrag).toHaveBeenCalledWith({x: 20, y: 10});
    expect(drag.endTextBoxDrag).toHaveBeenCalledOnce();
    expect(drag.editActiveTextBox).not.toHaveBeenCalled();
  });
});

function createController() {
  const startStroke = vi.fn();
  const continueStroke = vi.fn();
  const endStroke = vi.fn();
  const fillAt = vi.fn();
  const editActiveTextBox = vi.fn();
  const startTextBoxDrag = vi.fn(() => true);
  const continueTextBoxDrag = vi.fn();
  const endTextBoxDrag = vi.fn();
  const controller = new PaintToolInputController({
    pointerCount: () => 1,
    intentThreshold: () => 4,
    startStroke,
    continueStroke,
    endStroke,
    fillAt,
    hasActiveTextBoxAt: () => true,
    editActiveTextBox,
    startTextBoxDrag,
    continueTextBoxDrag,
    endTextBoxDrag,
  });

  return {
    controller,
    startStroke,
    continueStroke,
    endStroke,
    fillAt,
    editActiveTextBox,
    startTextBoxDrag,
    continueTextBoxDrag,
    endTextBoxDrag,
  };
}

function pointerEvent(pointerId: number, pointerType: string): PointerEvent {
  return {pointerId, pointerType} as PointerEvent;
}
