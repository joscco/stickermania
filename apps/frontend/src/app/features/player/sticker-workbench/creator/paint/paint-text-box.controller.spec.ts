import {describe, expect, it} from "vitest";

import {PaintTextBoxController, type PaintTextBoxDefaults} from "./paint-text-box.controller";
import type {PaintTextBox} from "./paint-text-utils";

const defaults: PaintTextBoxDefaults = {
  color: "#111111",
  fontSize: 48,
  lineHeight: 1.2,
  boxWidth: 320,
  align: "center",
  verticalAlign: "middle",
};

const textBox: PaintTextBox = {
  text: "Hallo",
  x: 100,
  y: 80,
  boxWidth: 200,
  boxHeight: 100,
  fontSize: 40,
  lineHeight: 1.2,
  color: "#111111",
  align: "center",
  verticalAlign: "middle",
};

describe("PaintTextBoxController", () => {
  it("moves a text box while preserving the pointer offset", () => {
    const controller = new PaintTextBoxController();
    controller.load(textBox);

    expect(controller.startDrag({x: 125, y: 100})).toBe(true);
    expect(controller.moveDrag({x: 225, y: 160})).toBe(true);
    expect(controller.value).toMatchObject({x: 200, y: 140});
    expect(controller.finishDrag()).toBe(true);
  });

  it("resizes from the top-left and clamps to the minimum size", () => {
    const controller = new PaintTextBoxController();
    controller.load(textBox);

    controller.resize("top-left", 500, 500);

    expect(controller.value).toMatchObject({
      x: 252,
      y: 148,
      boxWidth: 48,
      boxHeight: 32,
    });
  });

  it("restores an independent copy of the original text box", () => {
    const controller = new PaintTextBoxController();
    controller.load(textBox);
    controller.updateText("Geändert");
    controller.applyDefaults({...defaults, color: "#ff0000"}, false);

    expect(controller.restoreOriginal()).toEqual(textBox);
    expect(controller.value).not.toBe(textBox);
  });

  it("only exposes non-empty text for rendering", () => {
    const controller = new PaintTextBoxController();
    controller.load({...textBox, text: "   "});

    expect(controller.renderingValue()).toBeNull();
    controller.updateText("Text");
    expect(controller.renderingValue()).toMatchObject({text: "Text"});
  });
});
