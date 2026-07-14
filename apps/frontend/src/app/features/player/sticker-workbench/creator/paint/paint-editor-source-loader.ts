import type {StickerEditorData} from "@stickermania/shared";
import {DRAFT_STICKER_LAYER_ID, deleteStickerLayerSnapshot, readStickerLayerSnapshot, type StickerLayerSnapshot} from "../storage/sticker-layer-storage";
import type {PaintSourceLayer, StickerOutlineWidth} from "../shared/sticker-creator-types";
import {createPaintWorkspace, createPaintWorkspaceFromLayers, loadImage} from "./paint-canvas-utils";
import type {PaintTextBox} from "./paint-text-utils";

export type PaintEditorSourceLoadResult = {
  base: HTMLCanvasElement;
  paint: HTMLCanvasElement;
  outlineWidth: StickerOutlineWidth;
  textBox: PaintTextBox | null;
};

export type PaintEditorSourceLoadOptions = {
  dataUrl: string | null;
  editingStickerId: string | null;
  editorData: StickerEditorData | null;
  loadToken: number;
  currentLoadToken: () => number;
  defaultOutlineWidth: StickerOutlineWidth;
  normalizeOutlineWidth: (width: number | null | undefined) => StickerOutlineWidth;
};

export async function loadPaintEditorSource(options: PaintEditorSourceLoadOptions): Promise<PaintEditorSourceLoadResult | null> {
  deleteStickerLayerSnapshot(DRAFT_STICKER_LAYER_ID);

  if (options.editorData) {
    const remote = await loadRemoteEditorSource(options.editorData, options);
    if (remote) return remote;
  }
  const storedLayers = readStickerLayerSnapshot(options.editingStickerId);
  if (storedLayers) {
    const layered = await loadLayeredEditorSource(storedLayers, options);
    if (layered) return layered;
  }

  return loadFlatEditorSource(
    options.dataUrl,
    options.editingStickerId ? "paint" : "base",
    options,
  );
}

async function loadRemoteEditorSource(
  editorData: StickerEditorData,
  options: PaintEditorSourceLoadOptions,
): Promise<PaintEditorSourceLoadResult | null> {
  try {
    const [baseImage, paintImage] = await Promise.all([
      loadImage(editorData.baseImageUrl),
      loadImage(editorData.paintImageUrl),
    ]);
    if (!isCurrentLoad(options)) return null;
    return {
      ...createPaintWorkspaceFromLayers(baseImage, paintImage, editorData.workspace),
      outlineWidth: options.normalizeOutlineWidth(editorData.outlineWidth),
      textBox: editorData.textBox ? {...editorData.textBox} : null,
    };
  } catch {
    return null;
  }
}

async function loadLayeredEditorSource(
  snapshot: StickerLayerSnapshot,
  options: PaintEditorSourceLoadOptions,
): Promise<PaintEditorSourceLoadResult | null> {
  try {
    const [baseImage, paintImage] = await Promise.all([
      loadImage(snapshot.baseDataUrl),
      loadImage(snapshot.paintDataUrl),
    ]);
    if (!isCurrentLoad(options)) return null;
    return {
      ...createPaintWorkspaceFromLayers(baseImage, paintImage, snapshot.workspace),
      outlineWidth: options.normalizeOutlineWidth(snapshot.style?.outlineWidth),
      textBox: snapshot.version >= 2 && snapshot.textBox ? {...snapshot.textBox} : null,
    };
  } catch {
    if (!options.dataUrl || !isCurrentLoad(options)) return null;
    return loadFlatEditorSource(options.dataUrl, "paint", options);
  }
}

async function loadFlatEditorSource(
  dataUrl: string | null,
  sourceLayer: PaintSourceLayer,
  options: PaintEditorSourceLoadOptions,
): Promise<PaintEditorSourceLoadResult | null> {
  if (!dataUrl) {
    return {
      ...createPaintWorkspace(null, "base"),
      outlineWidth: options.defaultOutlineWidth,
      textBox: null,
    };
  }

  const image = await loadImage(dataUrl);
  if (!isCurrentLoad(options)) return null;
  return {
    ...createPaintWorkspace(image, sourceLayer),
    outlineWidth: options.defaultOutlineWidth,
    textBox: null,
  };
}

function isCurrentLoad(options: PaintEditorSourceLoadOptions): boolean {
  return options.loadToken === options.currentLoadToken();
}
