import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
import type {StickerEditorData} from "@birthday/shared";
import {
  type CanvasPoint,
  type ImageTransform,
  type PaintDisplay,
  type PaintEraserMode,
  type PaintTextAlign,
  type PaintTextVerticalAlign,
  type PaintTool,
  type PinchStart,
  STICKER_OUTLINE_WIDTHS,
  type StickerOutlineWidth,
} from "../shared/sticker-creator-types";
import {CanvasViewportController} from "../../../../../shared/ui/canvas/canvas-viewport.controller";
import {drawPaintEditorFrame} from "./paint-editor-renderer";
import {fillPaintLayerAtPoint} from "./paint-fill-utils";
import {drawPaintSegment} from "./paint-stroke-utils";
import {
  PAINT_TEXT_MIN_BOX_HEIGHT,
  type PaintTextBox,
} from "./paint-text-utils";
import {
  PaintTextBoxController,
  type ActivePaintTextBoxOverlay,
  type PaintTextBoxDefaults,
  type PaintTextResizeHandle,
  type PaintTextStyleUpdate,
} from "./paint-text-box.controller";
import {
  clampPaintTransformToViewport,
  paintPointFromCanvasPoint,
  transformForPaintPointAtCanvasPoint,
} from "./paint-transform-utils";
import {expandPaintWorkspaceCanvases} from "./paint-workspace-expansion";
import type {PaintInputPinchSnapshot} from "./paint-canvas-input.handler";
import {PaintDocumentController} from "./paint-document.controller";

export const DEFAULT_STICKER_OUTLINE_WIDTH: StickerOutlineWidth = 0;

const PAINT_WORKSPACE_EXPAND_MARGIN = STICKERMANIA_CONFIG.stickerCreator.paintWorkspaceExpandMarginPx;
const PAINT_WORKSPACE_MAX_SIDE = STICKERMANIA_CONFIG.stickerCreator.paintWorkspaceMaxSidePx;

export type PaintWorkspaceControllerOptions = {
  canvasViewport: CanvasViewportController;
  editingStickerId: () => string | null;
  editorData: () => StickerEditorData | null;
  paintTool: () => PaintTool;
  eraserMode: () => PaintEraserMode;
  paintColor: () => string;
  brushSize: () => number;
  outlineWidth: () => StickerOutlineWidth;
  paintTextColor: () => string;
  paintTextFontSize: () => number;
  paintTextLineHeight: () => number;
  paintTextBoxWidth: () => number;
  paintTextAlign: () => PaintTextAlign;
  paintTextVerticalAlign: () => PaintTextVerticalAlign;
  setOutlineWidth: (width: StickerOutlineWidth) => void;
  setPreviewReady: (ready: boolean) => void;
  setPreviewDataUrl: (dataUrl: string | null) => void;
  setCanUndoPaintStep: (canUndo: boolean) => void;
  setToolbarVisible: (visible: boolean) => void;
  setActiveTextBoxOverlay: (box: ActivePaintTextBoxOverlay | null) => void;
  setPaintTextStyle: (textBox: PaintTextBox) => void;
};

export class PaintWorkspaceController {
  private readonly textBox = new PaintTextBoxController();
  private readonly paintDocument: PaintDocumentController;
  private paintDrawing = false;
  private paintPointerId: number | null = null;
  private lastPaintPoint: CanvasPoint | null = null;
  private paintDisplay: PaintDisplay | null = null;
  private paintPinchStart: PinchStart | null = null;
  private paintTransform: ImageTransform = {x: 0, y: 0, scale: 1, rotation: 0};

  constructor(private readonly options: PaintWorkspaceControllerOptions) {
    this.paintDocument = new PaintDocumentController({
      outlineWidth: options.outlineWidth,
      textBox: () => this.textBox.renderingValue(),
      setPreviewReady: options.setPreviewReady,
      setPreviewDataUrl: options.setPreviewDataUrl,
    });
  }

  isDrawing(): boolean {
    return this.paintDrawing;
  }

  resetSelection(): void {
    this.paintDocument.reset();
    this.textBox.reset();
    this.options.setActiveTextBoxOverlay(null);
    this.paintDisplay = null;
    this.cancelActiveInteraction();
    this.options.setToolbarVisible(false);
    this.syncPaintHistoryState();
    this.redraw();
  }

  cancelActiveInteraction(): void {
    this.stopStrokeWithoutPreview();
    this.paintPinchStart = null;
    this.textBox.cancelInteraction();
  }

  async loadEditorSource(dataUrl: string | null): Promise<void> {
    const result = await this.paintDocument.loadSource({
      dataUrl,
      editingStickerId: this.options.editingStickerId(),
      editorData: this.options.editorData(),
      defaultOutlineWidth: DEFAULT_STICKER_OUTLINE_WIDTH,
      normalizeOutlineWidth: width => this.normalizeStickerOutlineWidth(width),
    });
    if (!result) return;
    this.options.setOutlineWidth(result.outlineWidth);
    this.applyPaintWorkspace(result.textBox);
  }

  async resetPaintEdits(): Promise<void> {
    const restored = await this.paintDocument.restoreOriginal();
    this.syncPaintHistoryState();
    if (!restored) return;

    const textBox = this.textBox.restoreOriginal();
    if (textBox) {
      this.options.setPaintTextStyle(textBox);
    }
    this.updateCompositePreview();
    this.redraw();
    this.syncActiveTextBoxOverlay();
  }

  async undoPaintStep(): Promise<void> {
    if (this.textBox.clear()) {
      this.options.setActiveTextBoxOverlay(null);
      this.syncPaintHistoryState();
      this.updateCompositePreview();
      this.redraw();
      return;
    }

    const restored = await this.paintDocument.undo();
    this.syncPaintHistoryState();
    if (!restored) return;

    this.stopStrokeWithoutPreview();
    this.updateCompositePreview();
    this.redraw();
  }

  redraw(): void {
    const canvas = this.options.canvasViewport.canvas();
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawPaintEditor(ctx, canvas);
  }

  updateCompositePreview(): void {
    this.paintDocument.updatePreview();
  }

  persistPaintLayers(stickerId: string): void {
    this.paintDocument.persist(stickerId);
  }

  panBy(deltaX: number, deltaY: number): void {
    this.paintTransform = this.clampPaintTransform({
      ...this.paintTransform,
      x: this.paintTransform.x + deltaX,
      y: this.paintTransform.y + deltaY,
    });
    this.redraw();
  }

  startPinch(snapshot: PaintInputPinchSnapshot): void {
    this.paintPinchStart = {
      distance: snapshot.distance,
      center: snapshot.center,
      transform: {...this.paintTransform},
      paintPoint: this.paintPointFromCanvasPoint(snapshot.center) ?? undefined,
    };
  }

  movePinch(snapshot: PaintInputPinchSnapshot): void {
    const start = this.paintPinchStart;
    if (!start || start.distance <= 0) return;

    if (start.paintPoint) {
      this.placePaintPointAtCanvasPoint(
        start.paintPoint,
        snapshot.center,
        start.transform.scale * snapshot.distance / start.distance,
      );
    } else {
      this.paintTransform = this.clampPaintTransform({
        ...start.transform,
        scale: start.transform.scale * snapshot.distance / start.distance,
      });
    }
    this.redraw();
  }

  endPinch(): void {
    this.paintPinchStart = null;
  }

  wheelZoom(point: CanvasPoint, factor: number): void {
    this.setPaintZoomAround(point, this.paintTransform.scale * factor);
    this.redraw();
  }

  startStroke(pointerId: number, canvasPoint: CanvasPoint): void {
    if (!this.pushPaintHistory()) return;
    const paintPoint = this.paintPointForDrawing(canvasPoint);
    if (!paintPoint) {
      this.paintDocument.discardLatestHistory();
      this.syncPaintHistoryState();
      return;
    }
    this.paintDrawing = true;
    this.paintPointerId = pointerId;
    this.lastPaintPoint = paintPoint;
    this.drawPaintSegment(paintPoint, paintPoint);
    this.redraw();
  }

  continueStroke(pointerId: number, canvasPoint: CanvasPoint): void {
    if (!this.paintDrawing || pointerId !== this.paintPointerId || !this.lastPaintPoint) return;
    const paintPoint = this.paintPointForDrawing(canvasPoint);
    if (!paintPoint) return;
    this.drawPaintSegment(this.lastPaintPoint, paintPoint);
    this.lastPaintPoint = paintPoint;
    this.redraw();
  }

  endStroke(pointerId: number): void {
    if (pointerId !== this.paintPointerId) return;
    this.paintDrawing = false;
    this.paintPointerId = null;
    this.lastPaintPoint = null;
    this.updateCompositePreview();
    this.redraw();
  }

  placeOrMoveTextBoxAt(canvasPoint: CanvasPoint): void {
    const paintPoint = this.paintPointForText(canvasPoint, this.options.paintTextBoxWidth(), Math.max(PAINT_TEXT_MIN_BOX_HEIGHT, this.options.paintTextFontSize() * 2.25));
    if (!paintPoint) return;

    this.textBox.place(paintPoint, this.textBoxDefaults());
    this.commitTextBoxChange();
  }

  ensureActiveTextBox(): void {
    if (this.textBox.applyDefaults(this.textBoxDefaults(), false)) {
      this.commitTextBoxChange();
      return;
    }

    const canvas = this.options.canvasViewport.canvas();
    if (!canvas) return;
    this.placeOrMoveTextBoxAt({x: canvas.width / 2, y: canvas.height / 2});
  }

  updateActiveTextBoxText(text: string): void {
    if (!this.textBox.hasValue) {
      const canvas = this.options.canvasViewport.canvas();
      if (!canvas) return;
      this.placeOrMoveTextBoxAt({x: canvas.width / 2, y: canvas.height / 2});
    }

    if (this.textBox.updateText(text)) {
      this.commitTextBoxChange();
    }
  }

  updateActiveTextBoxStyle(update: PaintTextStyleUpdate): void {
    if (this.textBox.updateStyle(update)) {
      this.commitTextBoxChange();
    }
  }

  activeTextBoxContainsCanvasPoint(canvasPoint: CanvasPoint): boolean {
    return this.textBox.contains(this.paintPointFromCanvasPoint(canvasPoint));
  }

  startActiveTextBoxDrag(canvasPoint: CanvasPoint): boolean {
    return this.textBox.startDrag(this.paintPointFromCanvasPoint(canvasPoint));
  }

  moveActiveTextBoxDrag(canvasPoint: CanvasPoint): void {
    const textBox = this.textBox.value;
    if (!textBox) return;

    const paintPoint = this.paintPointForText(canvasPoint, textBox.boxWidth, textBox.boxHeight);
    if (this.textBox.moveDrag(paintPoint)) {
      this.redraw();
    }
  }

  finishActiveTextBoxDrag(): void {
    if (this.textBox.finishDrag()) {
      this.updateCompositePreview();
      this.redraw();
    }
  }

  resizeActiveTextBoxFromCanvasDelta(handle: PaintTextResizeHandle, deltaCanvasX: number, deltaCanvasY: number): void {
    const display = this.paintDisplay;
    if (!display || display.scale <= 0) return;

    if (this.textBox.resize(handle, deltaCanvasX / display.scale, deltaCanvasY / display.scale)) {
      this.redraw();
    }
  }

  finishActiveTextBoxResize(): void {
    this.updateCompositePreview();
    this.redraw();
  }

  clearActiveTextBox(): void {
    if (!this.textBox.clear()) return;

    this.options.setActiveTextBoxOverlay(null);
    this.syncPaintHistoryState();
    this.updateCompositePreview();
    this.redraw();
  }

  activeTextBoxWidth(): number | null {
    return this.textBox.width;
  }

  fillAt(canvasPoint: CanvasPoint): void {
    const paintPoint = this.paintPointFromCanvasPoint(canvasPoint);
    const base = this.paintDocument.baseCanvas;
    const paint = this.paintDocument.paintCanvas;
    if (!paintPoint || !base || !paint || !this.pushPaintHistory()) return;

    if (!fillPaintLayerAtPoint(base, paint, paintPoint.x, paintPoint.y, this.options.paintColor())) {
      this.paintDocument.discardLatestHistory();
      this.syncPaintHistoryState();
      return;
    }
    this.updateCompositePreview();
    this.redraw();
  }

  private applyPaintWorkspace(textBox: PaintTextBox | null): void {
    this.paintTransform = {x: 0, y: 0, scale: 1, rotation: 0};
    const activeTextBox = this.textBox.load(textBox);
    if (activeTextBox) {
      this.options.setPaintTextStyle(activeTextBox);
    }
    this.options.setActiveTextBoxOverlay(null);
    this.options.setToolbarVisible(false);
    this.paintDisplay = null;
    this.syncPaintHistoryState();
    this.updateCompositePreview();
    this.redraw();
  }

  private drawPaintEditor(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    const base = this.paintDocument.baseCanvas;
    if (!base) return;

    const frame = drawPaintEditorFrame({
      ctx,
      canvas,
      baseCanvas: base,
      paintCanvas: this.paintDocument.paintCanvas,
      outlineCanvas: this.paintDocument.outlineCanvas,
      textBox: this.textBox.renderingValue(),
      transform: this.paintTransform,
      outlineWidth: this.options.outlineWidth(),
      canvasPixelRatio: this.options.canvasViewport.canvasPixelRatio(),
    });
    if (!frame) return;

    this.paintTransform = frame.transform;
    this.paintDisplay = frame.display;
    this.syncActiveTextBoxOverlay();
  }

  private normalizeStickerOutlineWidth(width: number | null | undefined): StickerOutlineWidth {
    if (width === 8) return 12;
    if (width === 16) return 24;
    if (width === 28) return 40;

    return STICKER_OUTLINE_WIDTHS.includes(width as StickerOutlineWidth)
      ? width as StickerOutlineWidth
      : DEFAULT_STICKER_OUTLINE_WIDTH;
  }

  private setPaintZoomAround(point: CanvasPoint, scale: number): void {
    const base = this.paintDocument.baseCanvas;
    const canvas = this.options.canvasViewport.canvas();
    const display = this.paintDisplay;
    if (!base || !canvas || !display) {
      this.paintTransform = this.clampPaintTransform({...this.paintTransform, scale});
      return;
    }

    const paintPoint = paintPointFromCanvasPoint(point, display, base);
    if (!paintPoint) {
      this.paintTransform = this.clampPaintTransform({...this.paintTransform, scale});
      return;
    }

    this.paintTransform = transformForPaintPointAtCanvasPoint({
      paintPoint,
      point,
      scale,
      currentTransform: this.paintTransform,
      contentSize: base,
      viewportSize: canvas,
      pixelRatio: this.options.canvasViewport.canvasPixelRatio(),
    });
  }

  private placePaintPointAtCanvasPoint(paintPoint: CanvasPoint, point: CanvasPoint, scale: number): void {
    const base = this.paintDocument.baseCanvas;
    const canvas = this.options.canvasViewport.canvas();
    if (!base || !canvas) {
      this.paintTransform = this.clampPaintTransform({...this.paintTransform, scale});
      return;
    }

    this.paintTransform = transformForPaintPointAtCanvasPoint({
      paintPoint,
      point,
      scale,
      currentTransform: this.paintTransform,
      contentSize: base,
      viewportSize: canvas,
      pixelRatio: this.options.canvasViewport.canvasPixelRatio(),
    });
  }

  private clampPaintTransform(transform: ImageTransform): ImageTransform {
    const canvas = this.options.canvasViewport.canvas();
    const base = this.paintDocument.baseCanvas;
    if (!canvas || !base) return transform;

    return clampPaintTransformToViewport(transform, base, canvas, this.options.canvasViewport.canvasPixelRatio());
  }

  private stopStrokeWithoutPreview(): void {
    this.paintDrawing = false;
    this.paintPointerId = null;
    this.lastPaintPoint = null;
  }

  private paintPointFromCanvasPoint(point: CanvasPoint): CanvasPoint | null {
    return paintPointFromCanvasPoint(point, this.paintDisplay, this.paintDocument.baseCanvas);
  }

  private paintPointForText(point: CanvasPoint, boxWidth: number, boxHeight: number): CanvasPoint | null {
    const display = this.paintDisplay;
    const base = this.paintDocument.baseCanvas;
    if (!display || !base || display.scale <= 0) return null;

    let paintPoint = paintPointFromCanvasPoint(point, display, base);
    if (paintPoint) return paintPoint;

    const rawPoint = {
      x: (point.x - display.x) / display.scale,
      y: (point.y - display.y) / display.scale,
    };
    const margin = PAINT_WORKSPACE_EXPAND_MARGIN + Math.max(boxWidth, boxHeight);
    const expandLeft = rawPoint.x - boxWidth / 2 < 0 ? Math.ceil(-(rawPoint.x - boxWidth / 2) + margin) : 0;
    const expandTop = rawPoint.y - boxHeight / 2 < 0 ? Math.ceil(-(rawPoint.y - boxHeight / 2) + margin) : 0;
    const expandRight = rawPoint.x + boxWidth / 2 > base.width ? Math.ceil(rawPoint.x + boxWidth / 2 - base.width + margin) : 0;
    const expandBottom = rawPoint.y + boxHeight / 2 > base.height ? Math.ceil(rawPoint.y + boxHeight / 2 - base.height + margin) : 0;
    if (expandLeft + expandTop + expandRight + expandBottom === 0) return null;

    const expanded = this.expandPaintWorkspace({left: expandLeft, top: expandTop, right: expandRight, bottom: expandBottom});
    if (!expanded) return null;
    paintPoint = {
      x: rawPoint.x + expanded.left,
      y: rawPoint.y + expanded.top,
    };
    return paintPointFromCanvasPoint(point, this.paintDisplay, this.paintDocument.baseCanvas) ?? paintPoint;
  }

  private paintPointForDrawing(point: CanvasPoint): CanvasPoint | null {
    const display = this.paintDisplay;
    const base = this.paintDocument.baseCanvas;
    if (!display || !base || display.scale <= 0) return null;

    let paintPoint = paintPointFromCanvasPoint(point, display, base);
    if (paintPoint) return paintPoint;

    const rawPoint = {
      x: (point.x - display.x) / display.scale,
      y: (point.y - display.y) / display.scale,
    };
    const brushRadius = Math.ceil(this.options.brushSize() * this.options.canvasViewport.canvasPixelRatio() / Math.max(1, display.scale) / 2);
    const margin = PAINT_WORKSPACE_EXPAND_MARGIN + brushRadius;
    const expandLeft = rawPoint.x < 0 ? Math.ceil(-rawPoint.x + margin) : 0;
    const expandTop = rawPoint.y < 0 ? Math.ceil(-rawPoint.y + margin) : 0;
    const expandRight = rawPoint.x > base.width ? Math.ceil(rawPoint.x - base.width + margin) : 0;
    const expandBottom = rawPoint.y > base.height ? Math.ceil(rawPoint.y - base.height + margin) : 0;
    if (expandLeft + expandTop + expandRight + expandBottom === 0) return null;

    const expanded = this.expandPaintWorkspace({left: expandLeft, top: expandTop, right: expandRight, bottom: expandBottom});
    if (!expanded) return null;
    paintPoint = {
      x: rawPoint.x + expanded.left,
      y: rawPoint.y + expanded.top,
    };
    return paintPointFromCanvasPoint(point, this.paintDisplay, this.paintDocument.baseCanvas) ?? paintPoint;
  }

  private expandPaintWorkspace(expand: {left: number; top: number; right: number; bottom: number}): {left: number; top: number} | null {
    const base = this.paintDocument.baseCanvas;
    const paint = this.paintDocument.paintCanvas;
    const display = this.paintDisplay;
    const canvas = this.options.canvasViewport.canvas();
    if (!base || !paint || !display || !canvas) return null;

    const expanded = expandPaintWorkspaceCanvases({
      baseCanvas: base,
      paintCanvas: paint,
      display,
      viewportSize: canvas,
      transform: this.paintTransform,
      canvasPixelRatio: this.options.canvasViewport.canvasPixelRatio(),
      maxSide: PAINT_WORKSPACE_MAX_SIDE,
      expand,
    });
    if (!expanded) return null;

    if (this.lastPaintPoint) {
      this.lastPaintPoint = {x: this.lastPaintPoint.x + expanded.offset.x, y: this.lastPaintPoint.y + expanded.offset.y};
    }
    this.textBox.shift(expanded.offset.x, expanded.offset.y);

    this.paintTransform = expanded.transform;
    this.paintDisplay = expanded.display;
    return {left: expanded.offset.x, top: expanded.offset.y};
  }

  private drawPaintSegment(from: CanvasPoint, to: CanvasPoint): void {
    drawPaintSegment({
      from,
      to,
      tool: this.options.paintTool(),
      eraserMode: this.options.eraserMode(),
      baseCanvas: this.paintDocument.baseCanvas,
      paintCanvas: this.paintDocument.paintCanvas,
      color: this.options.paintColor(),
      brushSize: this.options.brushSize(),
      canvasPixelRatio: this.options.canvasViewport.canvasPixelRatio(),
      display: this.paintDisplay,
    });
  }

  private textBoxDefaults(): PaintTextBoxDefaults {
    return {
      color: this.options.paintTextColor(),
      fontSize: this.options.paintTextFontSize(),
      lineHeight: this.options.paintTextLineHeight(),
      boxWidth: this.options.paintTextBoxWidth(),
      align: this.options.paintTextAlign(),
      verticalAlign: this.options.paintTextVerticalAlign(),
    };
  }

  private commitTextBoxChange(): void {
    this.syncPaintHistoryState();
    this.updateCompositePreview();
    this.redraw();
  }

  private syncActiveTextBoxOverlay(): void {
    this.options.setActiveTextBoxOverlay(
      this.textBox.overlay(this.paintDisplay, this.options.canvasViewport.canvasPixelRatio()),
    );
  }

  private pushPaintHistory(): boolean {
    const pushed = this.paintDocument.pushHistory();
    this.syncPaintHistoryState();
    return pushed;
  }

  private syncPaintHistoryState(): void {
    this.options.setCanUndoPaintStep(this.paintDocument.canUndo || this.textBox.hasValue);
  }
}
