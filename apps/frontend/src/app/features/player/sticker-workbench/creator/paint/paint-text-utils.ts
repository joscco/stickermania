import type {CanvasPoint, PaintDisplay, PaintTextAlign, PaintTextVerticalAlign} from "../shared/sticker-creator-types";

export type PaintTextBox = {
  text: string;
  x: number;
  y: number;
  boxWidth: number;
  boxHeight: number;
  fontSize: number;
  lineHeight?: number;

  color: string;
  align: PaintTextAlign;
  verticalAlign: PaintTextVerticalAlign;
};

export type PaintTextBoxOverlay = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  color: string;
  align: PaintTextAlign;
  verticalAlign: PaintTextVerticalAlign;
  paddingTop: number;
  paddingBottom: number;
};

const DEFAULT_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const PAINT_TEXT_DEFAULT_LINE_HEIGHT = 1.18;
export const PAINT_TEXT_DEFAULT_TEXT = "Text";
export const PAINT_TEXT_MIN_BOX_WIDTH = 48;
export const PAINT_TEXT_MIN_BOX_HEIGHT = 32;

export function createDefaultPaintTextBox(point: CanvasPoint, options: {
  color: string;
  fontSize: number;
  lineHeight: number;
  boxWidth: number;
  align: PaintTextAlign;
  verticalAlign: PaintTextVerticalAlign;
}): PaintTextBox {
  const fontSize = Math.max(1, options.fontSize);
  const boxWidth = Math.max(PAINT_TEXT_MIN_BOX_WIDTH, options.boxWidth);
  const lineHeight = normalizePaintTextLineHeight(options.lineHeight);
  const boxHeight = Math.max(PAINT_TEXT_MIN_BOX_HEIGHT, Math.round(fontSize * lineHeight * 2.25));
  return {
    text: PAINT_TEXT_DEFAULT_TEXT,
    x: point.x - boxWidth / 2,
    y: point.y - boxHeight / 2,
    boxWidth,
    boxHeight,
    fontSize,
    lineHeight,
    color: options.color,
    align: options.align,
    verticalAlign: options.verticalAlign,
  };
}

export function clonePaintTextBox(textBox: PaintTextBox | null): PaintTextBox | null {
  return textBox ? {...textBox} : null;
}

export function drawPaintTextBox(
  target: CanvasRenderingContext2D | HTMLCanvasElement | null,
  textBox: PaintTextBox | null,
): boolean {
  const text = textBox?.text.trim();
  if (!target || !textBox || !text) return false;

  const ctx = target instanceof HTMLCanvasElement ? target.getContext("2d") : target;
  if (!ctx) return false;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = textBox.color;
  ctx.textAlign = textBox.align;
  ctx.font = paintTextFont(textBox.fontSize);

  const lineHeight = paintTextLineHeight(textBox);
  const lines = wrapText(ctx, text, textBox.boxWidth);
  const fontMetrics = measurePaintFontMetrics(ctx, textBox.fontSize);
  const contentHeight = fontMetrics.ascent + fontMetrics.descent + Math.max(0, lines.length - 1) * lineHeight;
  const textX = textXForAlign(textBox.x, textBox.boxWidth, textBox.align);
  const firstBaselineY = textBox.y
    + textYOffsetForVerticalAlign(textBox.boxHeight, contentHeight, textBox.verticalAlign)
    + fontMetrics.ascent;
  ctx.textBaseline = "alphabetic";

  for (let index = 0; index < lines.length; index++) {
    ctx.fillText(lines[index], textX, firstBaselineY + index * lineHeight);
  }

  ctx.restore();
  return true;
}

export function measurePaintTextBoxContentHeight(textBox: PaintTextBox | null): number {
  if (!textBox) return 0;

  const scratch = document.createElement("canvas");
  const ctx = scratch.getContext("2d");
  if (!ctx) return paintTextLineHeight(textBox);

  ctx.font = paintTextFont(textBox.fontSize);
  const text = textBox.text.trim() || PAINT_TEXT_DEFAULT_TEXT;
  return Math.max(
    paintTextLineHeight(textBox),
    wrapText(ctx, text, textBox.boxWidth).length * paintTextLineHeight(textBox),
  );
}

export function paintTextBoxOverlay(textBox: PaintTextBox | null, display: PaintDisplay | null, canvasPixelRatio: number): PaintTextBoxOverlay | null {
  if (!textBox || !display || display.scale <= 0) return null;

  const ratio = Math.max(1, canvasPixelRatio);
  const contentHeight = measurePaintTextBoxContentHeight(textBox);
  const paddingTopWorkspace = textYOffsetForVerticalAlign(textBox.boxHeight, contentHeight, textBox.verticalAlign);
  const paddingBottomWorkspace = Math.max(0, textBox.boxHeight - contentHeight - paddingTopWorkspace);

  return {
    text: textBox.text,
    left: (display.x + textBox.x * display.scale) / ratio,
    top: (display.y + textBox.y * display.scale) / ratio,
    width: Math.max(1, textBox.boxWidth * display.scale / ratio),
    height: Math.max(1, textBox.boxHeight * display.scale / ratio),
    fontSize: Math.max(1, textBox.fontSize * display.scale / ratio),
    lineHeight: paintTextLineHeight(textBox) * display.scale / ratio,
    color: textBox.color,
    align: textBox.align,
    verticalAlign: textBox.verticalAlign,
    paddingTop: Math.max(0, paddingTopWorkspace * display.scale / ratio),
    paddingBottom: Math.max(0, paddingBottomWorkspace * display.scale / ratio),
  };
}

export function applicationFontFamily(): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return DEFAULT_FONT_FAMILY;
  }

  const bodyFont = window.getComputedStyle(document.body).fontFamily;
  return bodyFont?.trim() || DEFAULT_FONT_FAMILY;
}

function paintTextFont(fontSize: number): string {
  return `${Math.max(1, fontSize)}px ${applicationFontFamily()}`;
}

function paintTextLineHeight(textBox: Pick<PaintTextBox, "fontSize" | "lineHeight">): number {
  return Math.max(1, textBox.fontSize * normalizePaintTextLineHeight(textBox.lineHeight));
}

function measurePaintFontMetrics(ctx: CanvasRenderingContext2D, fontSize: number): {ascent: number; descent: number} {
  const metrics = ctx.measureText("Mg");
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  return {
    ascent: Number.isFinite(ascent) && ascent > 0 ? ascent : fontSize * 0.8,
    descent: Number.isFinite(descent) && descent >= 0 ? descent : fontSize * 0.2,
  };
}

function normalizePaintTextLineHeight(lineHeight: number | undefined): number {
  return typeof lineHeight === "number" && Number.isFinite(lineHeight)
    ? Math.max(0.5, lineHeight)
    : PAINT_TEXT_DEFAULT_LINE_HEIGHT;
}

function textXForAlign(left: number, width: number, align: PaintTextAlign): number {
  switch (align) {
    case "left":
      return left;
    case "center":
      return left + width / 2;
    case "right":
      return left + width;
  }
}

function textYOffsetForVerticalAlign(boxHeight: number, contentHeight: number, verticalAlign: PaintTextVerticalAlign): number {
  const freeSpace = Math.max(0, boxHeight - contentHeight);
  switch (verticalAlign) {
    case "top":
      return 0;
    case "middle":
      return freeSpace / 2;
    case "bottom":
      return freeSpace;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const wrapped = wrapParagraph(ctx, paragraph, Math.max(1, maxWidth));
    lines.push(...wrapped);
  }

  return lines.length ? lines : [""];
}

function wrapParagraph(ctx: CanvasRenderingContext2D, paragraph: string, maxWidth: number): string[] {
  const words = paragraph.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
      line = "";
    }

    const splitWord = splitLongWord(ctx, word, maxWidth);
    lines.push(...splitWord.slice(0, -1));
    line = splitWord.length ? splitWord[splitWord.length - 1] : "";
  }

  if (line) {
    lines.push(line);
  }

  return lines;
}

function splitLongWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const chunks: string[] = [];
  let chunk = "";

  for (const char of Array.from(word)) {
    const candidate = chunk + char;
    if (!chunk || ctx.measureText(candidate).width <= maxWidth) {
      chunk = candidate;
      continue;
    }

    chunks.push(chunk);
    chunk = char;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}
