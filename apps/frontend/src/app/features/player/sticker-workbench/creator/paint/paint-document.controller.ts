import type {StickerEditorData} from "@birthday/shared";

import {canvasToBoundedStickerPngDataUrl} from "../shared/sticker-output-canvas";
import type {StickerOutlineWidth} from "../shared/sticker-creator-types";
import {writeStickerLayerSnapshot} from "../storage/sticker-layer-storage";
import {
  createCompositeCanvas,
  createPaintOutlineCanvas,
  restorePaintLayerCanvases,
  trimTransparentCanvas,
} from "./paint-canvas-utils";
import {loadPaintEditorSource} from "./paint-editor-source-loader";
import {PaintHistoryStore} from "./paint-history.store";
import type {PaintTextBox} from "./paint-text-utils";

export type PaintDocumentControllerOptions = {
  outlineWidth: () => StickerOutlineWidth;
  textBox: () => PaintTextBox | null;
  setPreviewReady: (ready: boolean) => void;
  setPreviewDataUrl: (dataUrl: string | null) => void;
};

export type PaintDocumentSourceOptions = {
  dataUrl: string | null;
  editingStickerId: string | null;
  editorData: StickerEditorData | null;
  defaultOutlineWidth: StickerOutlineWidth;
  normalizeOutlineWidth: (width: number | null | undefined) => StickerOutlineWidth;
};

export type PaintDocumentSource = {
  outlineWidth: StickerOutlineWidth;
  textBox: PaintTextBox | null;
};

export class PaintDocumentController {
  private originalBaseLayerDataUrl: string | null = null;
  private originalPaintLayerDataUrl: string | null = null;
  private baseLayer: HTMLCanvasElement | null = null;
  private paintLayer: HTMLCanvasElement | null = null;
  private outlineLayer: HTMLCanvasElement | null = null;
  private loadToken = 0;
  private readonly history = new PaintHistoryStore();

  constructor(private readonly options: PaintDocumentControllerOptions) {}

  get baseCanvas(): HTMLCanvasElement | null {
    return this.baseLayer;
  }

  get paintCanvas(): HTMLCanvasElement | null {
    return this.paintLayer;
  }

  get outlineCanvas(): HTMLCanvasElement | null {
    return this.outlineLayer;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  async loadSource(options: PaintDocumentSourceOptions): Promise<PaintDocumentSource | null> {
    const loadToken = ++this.loadToken;
    const result = await loadPaintEditorSource({
      ...options,
      loadToken,
      currentLoadToken: () => this.loadToken,
    });
    if (!result) return null;

    this.open(result.base, result.paint);
    return {
      outlineWidth: result.outlineWidth,
      textBox: result.textBox,
    };
  }

  open(base: HTMLCanvasElement, paint: HTMLCanvasElement): void {
    this.baseLayer = base;
    this.paintLayer = paint;
    this.originalBaseLayerDataUrl = base.toDataURL("image/png");
    this.originalPaintLayerDataUrl = paint.toDataURL("image/png");
    this.outlineLayer = null;
    this.history.clear();
  }

  reset(): void {
    this.loadToken++;
    this.originalBaseLayerDataUrl = null;
    this.originalPaintLayerDataUrl = null;
    this.baseLayer = null;
    this.paintLayer = null;
    this.outlineLayer = null;
    this.history.clear();
    this.options.setPreviewReady(false);
    this.options.setPreviewDataUrl(null);
  }

  pushHistory(): boolean {
    const base = this.baseLayer;
    const paint = this.paintLayer;
    if (!base || !paint) return false;

    this.history.push({
      baseDataUrl: base.toDataURL("image/png"),
      paintDataUrl: paint.toDataURL("image/png"),
    });
    return true;
  }

  discardLatestHistory(): void {
    this.history.discardLatest();
  }

  async restoreOriginal(): Promise<boolean> {
    const base = this.baseLayer;
    const paint = this.paintLayer;
    const baseDataUrl = this.originalBaseLayerDataUrl;
    const paintDataUrl = this.originalPaintLayerDataUrl;
    if (!base || !paint || !baseDataUrl || !paintDataUrl || !this.pushHistory()) {
      return false;
    }

    try {
      return await restorePaintLayerCanvases(base, paint, {baseDataUrl, paintDataUrl});
    } catch {
      return false;
    }
  }

  async undo(): Promise<boolean> {
    const snapshot = this.history.pop();
    const base = this.baseLayer;
    const paint = this.paintLayer;
    if (!snapshot || !base || !paint) return false;

    try {
      return await restorePaintLayerCanvases(base, paint, snapshot);
    } catch {
      this.history.clear();
      return false;
    }
  }

  updatePreview(): void {
    const textBox = this.options.textBox();
    const outlineWidth = this.options.outlineWidth();
    this.outlineLayer = createPaintOutlineCanvas(this.baseLayer, this.paintLayer, outlineWidth, textBox);

    const output = createCompositeCanvas(this.baseLayer, this.paintLayer, outlineWidth, textBox);
    if (!output) return;

    const trimmed = trimTransparentCanvas(output);
    this.options.setPreviewReady(!!trimmed);
    this.options.setPreviewDataUrl(trimmed ? canvasToBoundedStickerPngDataUrl(trimmed) : null);
  }

  persist(stickerId: string): void {
    const base = this.baseLayer;
    const paint = this.paintLayer;
    if (!base || !paint) return;

    const textBox = this.options.textBox();
    writeStickerLayerSnapshot(stickerId, {
      version: 2,
      baseDataUrl: base.toDataURL("image/png"),
      paintDataUrl: paint.toDataURL("image/png"),
      workspace: {
        width: base.width,
        height: base.height,
      },
      style: {
        outlineWidth: this.options.outlineWidth(),
      },
      ...(textBox ? {textBox} : {}),
      updatedAt: Date.now(),
    });
  }
}
