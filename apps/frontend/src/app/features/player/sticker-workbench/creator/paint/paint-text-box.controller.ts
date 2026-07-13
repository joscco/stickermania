import type {
  CanvasPoint,
  PaintDisplay,
  PaintTextAlign,
  PaintTextVerticalAlign,
} from "../shared/sticker-creator-types";
import {
  clonePaintTextBox,
  createDefaultPaintTextBox,
  PAINT_TEXT_MIN_BOX_HEIGHT,
  PAINT_TEXT_MIN_BOX_WIDTH,
  paintTextBoxOverlay,
  type PaintTextBox,
  type PaintTextBoxOverlay,
} from "./paint-text-utils";

export type PaintTextStyleUpdate = Partial<Pick<
  PaintTextBox,
  "color" | "fontSize" | "lineHeight" | "boxWidth" | "boxHeight" | "align" | "verticalAlign"
>>;

export type PaintTextResizeHandle = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type ActivePaintTextBoxOverlay = PaintTextBoxOverlay;

export type PaintTextBoxDefaults = {
  color: string;
  fontSize: number;
  lineHeight: number;
  boxWidth: number;
  align: PaintTextAlign;
  verticalAlign: PaintTextVerticalAlign;
};

export class PaintTextBoxController {
  private active: PaintTextBox | null = null;
  private original: PaintTextBox | null = null;
  private dragOffset: CanvasPoint | null = null;

  get value(): PaintTextBox | null {
    return this.active;
  }

  get hasValue(): boolean {
    return this.active !== null;
  }

  get width(): number | null {
    return this.active?.boxWidth ?? null;
  }

  get isDragging(): boolean {
    return this.dragOffset !== null;
  }

  reset(): void {
    this.active = null;
    this.original = null;
    this.dragOffset = null;
  }

  load(textBox: PaintTextBox | null): PaintTextBox | null {
    this.active = clonePaintTextBox(textBox);
    this.original = clonePaintTextBox(textBox);
    this.dragOffset = null;
    return this.active;
  }

  restoreOriginal(): PaintTextBox | null {
    this.active = clonePaintTextBox(this.original);
    this.dragOffset = null;
    return this.active;
  }

  clear(): boolean {
    if (!this.active) return false;
    this.active = null;
    this.dragOffset = null;
    return true;
  }

  cancelInteraction(): void {
    this.dragOffset = null;
  }

  place(point: CanvasPoint, defaults: PaintTextBoxDefaults): void {
    if (this.active) {
      this.active.x = point.x - this.active.boxWidth / 2;
      this.active.y = point.y - this.active.boxHeight / 2;
      this.applyDefaults(defaults, false);
      return;
    }

    this.active = createDefaultPaintTextBox(point, defaults);
  }

  applyDefaults(defaults: PaintTextBoxDefaults, updateWidth: boolean): boolean {
    if (!this.active) return false;

    this.active = {
      ...this.active,
      color: defaults.color,
      fontSize: defaults.fontSize,
      lineHeight: defaults.lineHeight,
      boxWidth: updateWidth
        ? Math.max(PAINT_TEXT_MIN_BOX_WIDTH, defaults.boxWidth)
        : this.active.boxWidth,
      align: defaults.align,
      verticalAlign: defaults.verticalAlign,
    };
    return true;
  }

  updateText(text: string): boolean {
    if (!this.active) return false;
    this.active.text = text;
    return true;
  }

  updateStyle(update: PaintTextStyleUpdate): boolean {
    if (!this.active) return false;

    this.active = {
      ...this.active,
      ...update,
      fontSize: Math.max(1, update.fontSize ?? this.active.fontSize),
      boxWidth: Math.max(PAINT_TEXT_MIN_BOX_WIDTH, update.boxWidth ?? this.active.boxWidth),
      boxHeight: Math.max(PAINT_TEXT_MIN_BOX_HEIGHT, update.boxHeight ?? this.active.boxHeight),
    };
    return true;
  }

  contains(paintPoint: CanvasPoint | null): boolean {
    const textBox = this.active;
    if (!textBox || !paintPoint) return false;

    return paintPoint.x >= textBox.x
      && paintPoint.x <= textBox.x + textBox.boxWidth
      && paintPoint.y >= textBox.y
      && paintPoint.y <= textBox.y + textBox.boxHeight;
  }

  startDrag(paintPoint: CanvasPoint | null): boolean {
    const textBox = this.active;
    if (!textBox || !paintPoint || !this.contains(paintPoint)) return false;

    this.dragOffset = {
      x: paintPoint.x - textBox.x,
      y: paintPoint.y - textBox.y,
    };
    return true;
  }

  moveDrag(paintPoint: CanvasPoint | null): boolean {
    const textBox = this.active;
    const offset = this.dragOffset;
    if (!textBox || !offset || !paintPoint) return false;

    textBox.x = paintPoint.x - offset.x;
    textBox.y = paintPoint.y - offset.y;
    return true;
  }

  finishDrag(): boolean {
    if (!this.dragOffset) return false;
    this.dragOffset = null;
    return true;
  }

  resize(handle: PaintTextResizeHandle, deltaX: number, deltaY: number): boolean {
    const textBox = this.active;
    if (!textBox) return false;

    if (handle.endsWith("left")) {
      const nextWidth = textBox.boxWidth - deltaX;
      if (nextWidth <= PAINT_TEXT_MIN_BOX_WIDTH) {
        textBox.x += textBox.boxWidth - PAINT_TEXT_MIN_BOX_WIDTH;
        textBox.boxWidth = PAINT_TEXT_MIN_BOX_WIDTH;
      } else {
        textBox.x += deltaX;
        textBox.boxWidth = nextWidth;
      }
    } else {
      textBox.boxWidth = Math.max(PAINT_TEXT_MIN_BOX_WIDTH, textBox.boxWidth + deltaX);
    }

    if (handle.startsWith("top")) {
      const nextHeight = textBox.boxHeight - deltaY;
      if (nextHeight <= PAINT_TEXT_MIN_BOX_HEIGHT) {
        textBox.y += textBox.boxHeight - PAINT_TEXT_MIN_BOX_HEIGHT;
        textBox.boxHeight = PAINT_TEXT_MIN_BOX_HEIGHT;
      } else {
        textBox.y += deltaY;
        textBox.boxHeight = nextHeight;
      }
    } else {
      textBox.boxHeight = Math.max(PAINT_TEXT_MIN_BOX_HEIGHT, textBox.boxHeight + deltaY);
    }

    return true;
  }

  shift(deltaX: number, deltaY: number): void {
    if (!this.active) return;
    this.active = {
      ...this.active,
      x: this.active.x + deltaX,
      y: this.active.y + deltaY,
    };
  }

  renderingValue(): PaintTextBox | null {
    const textBox = clonePaintTextBox(this.active);
    return textBox?.text.trim() ? textBox : null;
  }

  overlay(display: PaintDisplay | null, canvasPixelRatio: number): PaintTextBoxOverlay | null {
    return paintTextBoxOverlay(this.active, display, canvasPixelRatio);
  }
}
