import {AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, effect, input, output, signal} from "@angular/core";
import type {PlayerSticker, StickerEditorData} from "@birthday/shared";
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
import {
  BRUSH_SIZES,
  PAINT_COLORS,
  type PaintEraserMode,
  type PaintTextAlign,
  type PaintTextFontSize,
  type PaintTextVerticalAlign,
  type PaintTool,
  type StickerCreatorResult,
  type StickerOutlineWidth,
} from "../shared/sticker-creator-types";
import {StickerCreatorPaintToolbarComponent} from "./sticker-creator-paint-toolbar.component";
import {PaintSubmissionController, type PaintCreateStatus} from "./paint-submission.controller";
import {paintCanvasCursor, paintToolLabel, paintToolUsesBrushSize} from "./paint-tool-ui";
import {SvgComponent} from '../../../../../shared/ui/svg/svg.component';
import {PointerSurfaceDirective} from "../../../../../shared/input/pointer-surface.directive";
import {DRAFT_STICKER_LAYER_ID, deleteStickerLayerSnapshot} from '../storage/sticker-layer-storage';
import {STICKERMANIA_COLORS} from "../../../../../shared/theme/stickermania-theme";
import {PaintCanvasInputHandler} from "./paint-canvas-input.handler";
import {
  DEFAULT_STICKER_OUTLINE_WIDTH,
  PaintWorkspaceController,
} from "./paint-workspace.controller";
import {
  type ActivePaintTextBoxOverlay,
  type PaintTextStyleUpdate,
} from "./paint-text-box.controller";
import {PAINT_TEXT_DEFAULT_LINE_HEIGHT} from "./paint-text-utils";
import {
  type PaintTextResizeDelta,
  StickerCreatorPaintTextEditorComponent,
} from "./sticker-creator-paint-text-editor.component";
import {StickerCreatorNameDialogComponent} from "./sticker-creator-name-dialog.component";
import {CanvasViewportController} from "../../../../../shared/ui/canvas/canvas-viewport.controller";

type PaintPointerPreview = {x: number; y: number; size: number; visible: boolean; tool: "brush" | "eraser"};

@Component({
  selector: "app-sticker-creator-paint",
  standalone: true,
  imports: [
    SvgComponent,
    PointerSurfaceDirective,
    StickerCreatorPaintToolbarComponent,
    StickerCreatorPaintTextEditorComponent,
    StickerCreatorNameDialogComponent,
  ],
  templateUrl: "./sticker-creator-paint.component.html",
})
export class StickerCreatorPaintComponent implements AfterViewInit, OnDestroy {
  readonly stickers = input<PlayerSticker[]>([]);
  readonly createStatus = input<PaintCreateStatus>("idle");
  readonly initialStickerDataUrl = input<string | null>(null);
  readonly initialStickerName = input<string | null>(null);
  readonly editingStickerId = input<string | null>(null);
  readonly initialStickerEditorData = input<StickerEditorData | null>(null);
  readonly initialPaintTool = input<PaintTool>("hand");

  readonly createSticker = output<StickerCreatorResult>();
  readonly stickerCreated = output<void>();
  readonly canceled = output<void>();

  @ViewChild("canvasFrame") set canvasFrameRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this.canvasViewport.setCanvasFrame(ref);
  }

  @ViewChild("sourceCanvas") set sourceCanvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasViewport.setSourceCanvas(ref, true);
  }

  readonly sourceLoaded = signal(false);
  readonly previewReady = signal(false);
  readonly statusText = signal("");
  readonly previewDataUrl = signal<string | null>(null);
  readonly paintTool = signal<PaintTool>("hand");
  readonly eraserMode = signal<PaintEraserMode>("paint");
  readonly paintColor = signal<(typeof PAINT_COLORS)[number]>(STICKERMANIA_COLORS.ink);
  readonly paintTextColor = signal<(typeof PAINT_COLORS)[number]>(STICKERMANIA_COLORS.ink);
  readonly brushSize = signal<(typeof BRUSH_SIZES)[number]>(16);
  readonly stickerOutlineWidth = signal<StickerOutlineWidth>(DEFAULT_STICKER_OUTLINE_WIDTH);
  readonly paintTextFontSize = signal<PaintTextFontSize>(48);
  readonly paintTextLineHeight = signal(PAINT_TEXT_DEFAULT_LINE_HEIGHT);
  readonly paintTextBoxWidth = signal<number>(320);
  readonly paintTextAlign = signal<PaintTextAlign>("center");
  readonly paintTextVerticalAlign = signal<PaintTextVerticalAlign>("middle");
  readonly activeTextBoxOverlay = signal<ActivePaintTextBoxOverlay | null>(null);
  readonly stickerName = signal("");
  readonly pendingStickerDataUrl = signal<string | null>(null);
  readonly stickerPreparing = signal(false);
  readonly paintToolbarVisible = signal(false);
  readonly paintTextMenuVisible = signal(false);
  readonly paintPointerPreview = signal<PaintPointerPreview | null>(null);
  readonly canUndoPaintStep = signal(false);
  readonly toolbarPaintColor = computed(() => this.paintTool() === "text" ? this.paintTextColor() : this.paintColor());
  readonly paintTextEditorSettings = computed(() => ({
    color: this.paintTextColor(),
    fontSize: this.paintTextFontSize(),
    lineHeight: this.paintTextLineHeight(),
    align: this.paintTextAlign(),
    verticalAlign: this.paintTextVerticalAlign(),
  }));

  private loadedEditorSourceKey: string | null | undefined = undefined;
  private initialPaintToolApplied = false;
  private readonly canvasViewport = new CanvasViewportController({
    redraw: () => this.workspace.redraw(),
  });
  @ViewChild(StickerCreatorPaintTextEditorComponent)
  private paintTextEditor?: StickerCreatorPaintTextEditorComponent;

  private readonly workspace = new PaintWorkspaceController({
    canvasViewport: this.canvasViewport,
    editingStickerId: () => this.editingStickerId(),
    editorData: () => this.initialStickerEditorData(),
    paintTool: () => this.paintTool(),
    eraserMode: () => this.eraserMode(),
    paintColor: () => this.paintColor(),
    brushSize: () => this.brushSize(),
    outlineWidth: () => this.stickerOutlineWidth(),
    paintTextColor: () => this.paintTextColor(),
    paintTextFontSize: () => this.paintTextFontSize(),
    paintTextLineHeight: () => this.paintTextLineHeight(),
    paintTextBoxWidth: () => this.paintTextBoxWidth(),
    paintTextAlign: () => this.paintTextAlign(),
    paintTextVerticalAlign: () => this.paintTextVerticalAlign(),
    setOutlineWidth: width => this.stickerOutlineWidth.set(width),
    setPreviewReady: ready => this.previewReady.set(ready),
    setPreviewDataUrl: dataUrl => this.previewDataUrl.set(dataUrl),
    setCanUndoPaintStep: canUndo => this.canUndoPaintStep.set(canUndo),
    setToolbarVisible: visible => this.paintToolbarVisible.set(visible),
    setActiveTextBoxOverlay: box => this.activeTextBoxOverlay.set(box),
    setPaintTextStyle: textBox => {
      this.paintTextColor.set(textBox.color as (typeof PAINT_COLORS)[number]);
      this.paintTextFontSize.set(textBox.fontSize as PaintTextFontSize);
      this.paintTextLineHeight.set(textBox.lineHeight ?? PAINT_TEXT_DEFAULT_LINE_HEIGHT);
      this.paintTextBoxWidth.set(textBox.boxWidth);
      this.paintTextAlign.set(textBox.align);
      this.paintTextVerticalAlign.set(textBox.verticalAlign);
    },
  });
  readonly paintInputHandler = new PaintCanvasInputHandler({
    isSourceLoaded: () => this.sourceLoaded(),
    toolbarVisible: () => this.paintToolbarVisible(),
    closeToolbar: () => this.closePaintToolbar(),
    tool: () => this.paintTool(),
    surface: () => this.canvasViewport.canvas(),
    toCanvasPoint: event => this.canvasViewport.canvasPoint(event),
    toWheelPoint: event => this.canvasViewport.canvasPointFromClient(event.clientX, event.clientY),
    canvasPixelRatio: () => this.canvasViewport.canvasPixelRatio(),
    showPointerPreview: (clientX, clientY) => this.updatePaintPointerPreview(clientX, clientY),
    hidePointerPreview: () => this.hidePaintPointerPreview(),
    startStroke: (pointerId, point) => this.workspace.startStroke(pointerId, point),
    continueStroke: (pointerId, point) => this.workspace.continueStroke(pointerId, point),
    endStroke: pointerId => this.workspace.endStroke(pointerId),
    fillAt: point => this.workspace.fillAt(point),
    hasActiveTextBoxAt: point => this.workspace.activeTextBoxContainsCanvasPoint(point),
    editActiveTextBox: () => this.editActivePaintTextBox(),
    startTextBoxDrag: point => this.workspace.startActiveTextBoxDrag(point),
    continueTextBoxDrag: point => this.workspace.moveActiveTextBoxDrag(point),
    endTextBoxDrag: () => this.workspace.finishActiveTextBoxDrag(),
    panBy: (deltaX, deltaY) => this.workspace.panBy(deltaX, deltaY),
    pinchStart: snapshot => this.workspace.startPinch(snapshot),
    pinchMove: snapshot => this.workspace.movePinch(snapshot),
    pinchEnd: () => this.workspace.endPinch(),
    wheelZoom: (point, factor) => this.workspace.wheelZoom(point, factor),
  });
  private readonly submission = new PaintSubmissionController({
    stickers: () => this.stickers(),
    previewReady: this.previewReady,
    previewDataUrl: this.previewDataUrl,
    pendingStickerDataUrl: this.pendingStickerDataUrl,
    stickerPreparing: this.stickerPreparing,
    statusText: this.statusText,
    updateCompositePreview: () => this.workspace.updateCompositePreview(),
    persistDraftLayers: () => this.workspace.persistPaintLayers(DRAFT_STICKER_LAYER_ID),
    hidePointerPreview: () => this.hidePaintPointerPreview(),
    closeToolbar: () => this.paintToolbarVisible.set(false),
    normalizedStickerName: () => this.normalizedStickerName(),
    createSticker: result => this.createSticker.emit(result),
    afterStickerSaved: () => {
      this.resetAfterStickerSaved();
      this.stickerCreated.emit();
    },
  });

  constructor() {
    effect(() => {
      if (this.initialPaintToolApplied) return;
      this.initialPaintToolApplied = true;
      this.paintTool.set(this.initialPaintTool());
    });
    effect(() => {
      this.submission.observeStickerList();
    });
    effect(() => {
      this.submission.observeCreateStatus(this.createStatus());
    });
    effect(() => {
      const sourceDataUrl = this.initialStickerDataUrl();
      const sourceKey = this.editorSourceKey(sourceDataUrl, this.initialStickerEditorData());
      if (sourceKey === this.loadedEditorSourceKey) return;
      this.loadedEditorSourceKey = sourceKey;
      this.stickerName.set(this.initialStickerName() ?? "");
      if (!this.canvasViewport.canvas()) return;
      setTimeout(() => this.loadEditorSource(sourceDataUrl));
    });
  }

  ngAfterViewInit(): void {
    this.sourceLoaded.set(true);
    this.canvasViewport.scheduleRender(true);
    setTimeout(() => this.loadEditorSource(this.initialStickerDataUrl()));
  }

  ngOnDestroy(): void {
    this.paintInputHandler.dispose();
    this.canvasViewport.dispose();
    this.submission.destroy();
  }

  cancelStickerCreation(): void {
    deleteStickerLayerSnapshot(DRAFT_STICKER_LAYER_ID);
    this.loadedEditorSourceKey = null;
    this.resetSelection();
    this.canceled.emit();
  }

  confirmSticker(): void {
    this.submission.confirmSticker();
  }

  submitPendingSticker(): void {
    this.submission.submitPendingSticker();
  }

  editPendingStickerAgain(): void {
    this.pendingStickerDataUrl.set(null);
  }

  selectPaintTool(tool: PaintTool): void {
    const toolIsAlreadyActive = this.paintTool() === tool;

    this.paintTool.set(tool);
    if (tool === "text") {
      this.paintToolbarVisible.set(false);
      this.paintTextMenuVisible.update(visible => toolIsAlreadyActive ? !visible : true);
    } else {
      this.paintTextMenuVisible.set(false);
      this.paintToolbarVisible.update(visible => toolIsAlreadyActive ? !visible : true);
    }
    this.resetActivePaintInteraction();
    if (tool === "text") {
      this.workspace.ensureActiveTextBox();
    }
  }

  selectEraserMode(mode: PaintEraserMode): void {
    this.eraserMode.set(mode);
    this.paintTool.set("eraser");
    this.paintToolbarVisible.set(true);
    this.paintTextMenuVisible.set(false);
    this.resetActivePaintInteraction();
  }

  selectPaintColor(color: (typeof PAINT_COLORS)[number]): void {
    if (this.paintTool() === "text") {
      this.selectPaintTextColor(color);
      return;
    }

    this.paintColor.set(color);
    if (this.paintTool() !== "fill") {
      this.paintTool.set("brush");
      this.paintToolbarVisible.set(true);
    }
  }

  selectPaintTextColor(color: (typeof PAINT_COLORS)[number]): void {
    this.paintTextColor.set(color);
    this.workspace.updateActiveTextBoxStyle({color});
  }

  selectBrushSize(size: (typeof BRUSH_SIZES)[number]): void {
    this.brushSize.set(size);
  }

  updateActivePaintTextStyle(update: PaintTextStyleUpdate): void {
    if (update.color !== undefined) {
      this.paintTextColor.set(update.color as (typeof PAINT_COLORS)[number]);
    }
    if (update.fontSize !== undefined) {
      this.paintTextFontSize.set(update.fontSize as PaintTextFontSize);
    }
    if (update.lineHeight !== undefined) {
      this.paintTextLineHeight.set(update.lineHeight);
    }
    if (update.boxWidth !== undefined) {
      this.paintTextBoxWidth.set(update.boxWidth);
    }
    if (update.align !== undefined) {
      this.paintTextAlign.set(update.align);
    }
    if (update.verticalAlign !== undefined) {
      this.paintTextVerticalAlign.set(update.verticalAlign);
    }
    this.workspace.updateActiveTextBoxStyle(update);
  }

  updateActivePaintText(value: string): void {
    this.workspace.updateActiveTextBoxText(value);
  }

  editActivePaintTextBox(): void {
    if (this.paintTool() !== "text" || !this.activeTextBoxOverlay()) return;
    this.paintTextEditor?.startEditing();
  }

  clearActivePaintTextBox(): void {
    this.paintTextEditor?.stopEditing();
    this.workspace.clearActiveTextBox();
  }

  resizePaintTextBox(event: PaintTextResizeDelta): void {
    const pixelRatio = this.canvasViewport.canvasPixelRatio();
    this.workspace.resizeActiveTextBoxFromCanvasDelta(
      event.handle,
      event.deltaClientX * pixelRatio,
      event.deltaClientY * pixelRatio,
    );
    const width = this.workspace.activeTextBoxWidth();
    if (width !== null) {
      this.paintTextBoxWidth.set(Math.round(width));
    }
  }

  finishPaintTextResize(): void {
    this.workspace.finishActiveTextBoxResize();
    const width = this.workspace.activeTextBoxWidth();
    if (width !== null) {
      this.paintTextBoxWidth.set(Math.round(width));
    }
  }

  selectStickerOutlineWidth(width: StickerOutlineWidth): void {
    this.stickerOutlineWidth.set(width);
    this.workspace.updateCompositePreview();
    this.workspace.redraw();
  }

  paintToolUsesBrushSize(): boolean {
    return paintToolUsesBrushSize(this.paintTool());
  }

  togglePaintToolbar(): void {
    this.paintToolbarVisible.update(visible => !visible);
    this.resetActivePaintInteraction();
  }

  closePaintToolbar(): void {
    this.paintToolbarVisible.set(false);
    this.resetActivePaintInteraction();
  }

  currentPaintToolLabel(): string {
    return paintToolLabel(this.paintTool(), this.eraserMode());
  }

  paintCanvasCursor(): string {
    return paintCanvasCursor({
      tool: this.paintTool(),
      toolbarVisible: this.paintToolbarVisible(),
      drawing: this.workspace.isDrawing(),
      panning: this.paintInputHandler.isPanning(),
    });
  }

  paintPointerBorderColor(pointer: PaintPointerPreview): string {
    return pointer.tool === "brush" ? this.paintColor() : STICKERMANIA_COLORS.white;
  }

  paintPointerBoxShadow(pointer: PaintPointerPreview): string {
    if (pointer.tool === "brush") {
      return `0 0 0 1px ${STICKERMANIA_COLORS.white}, 0 0 0 3px rgba(17,24,39,.55)`;
    }

    return `0 0 0 1px ${STICKERMANIA_COLORS.ink}, 0 0 0 4px rgba(255,255,255,.25)`;
  }

  resetPaintEditsAndCloseTools(): void {
    this.resetPaintEdits();
    this.paintTool.set("hand");
    this.paintToolbarVisible.set(false);
    this.paintTextMenuVisible.set(false);
    this.paintTextEditor?.cancelInteraction();
  }

  resetPaintEdits(): void {
    void this.workspace.resetPaintEdits();
  }

  undoPaintStep(): void {
    void this.workspace.undoPaintStep();
  }

  private resetSelection(): void {
    this.paintTextEditor?.cancelInteraction();
    this.paintTextMenuVisible.set(false);
    this.workspace.resetSelection();
    this.paintInputHandler.cancel();
    this.hidePaintPointerPreview();
    this.submission.reset();
  }

  private resetAfterStickerSaved(): void {
    this.resetSelection();
    this.loadedEditorSourceKey = null;
    this.loadEditorSource(null);
  }

  private updatePaintPointerPreview(clientX: number, clientY: number): void {
    if (this.paintToolbarVisible() || !this.paintToolUsesBrushSize()) {
      this.hidePaintPointerPreview();
      return;
    }
    const canvas = this.canvasViewport.canvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    this.paintPointerPreview.set({
      x: clientX - rect.left,
      y: clientY - rect.top,
      size: this.brushSize(),
      visible: true,
      tool: this.paintTool() === "eraser" ? "eraser" : "brush",
    });
  }

  private hidePaintPointerPreview(): void {
    this.paintPointerPreview.set(null);
  }

  private resetActivePaintInteraction(): void {
    this.paintTextEditor?.cancelInteraction();
    this.paintInputHandler.cancel();
    this.workspace.cancelActiveInteraction();
    this.hidePaintPointerPreview();
  }

  private async loadEditorSource(dataUrl: string | null): Promise<void> {
    this.sourceLoaded.set(true);
    await this.workspace.loadEditorSource(dataUrl);
  }

  private editorSourceKey(dataUrl: string | null, editorData: StickerEditorData | null): string {
    return [dataUrl ?? "", editorData?.baseImageUrl ?? "", editorData?.paintImageUrl ?? ""].join("|");
  }

  private normalizedStickerName(): string {
    return this.stickerName().trim().slice(0, STICKERMANIA_CONFIG.defaultCatalog.maxStickerNameLength);
  }

}
