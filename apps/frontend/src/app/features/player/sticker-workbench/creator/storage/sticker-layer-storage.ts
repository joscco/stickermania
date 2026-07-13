import type {StickerEditorUpload} from "@birthday/shared";
import type {PaintTextAlign, PaintTextVerticalAlign} from "../shared/sticker-creator-types";

export type StickerTextLayerSnapshot = {
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

export type StickerLayerSnapshot = {
  version: 1 | 2;
  baseDataUrl: string;
  paintDataUrl: string;
  workspace: {
    width: number;
    height: number;
  };
  style?: {
    outlineWidth?: number;
  };
  textBox?: StickerTextLayerSnapshot;
  updatedAt: number;
};

export const DRAFT_STICKER_LAYER_ID = "__draft__";

const STORAGE_PREFIX = "stickermania:sticker-layers:";
const memorySnapshots = new Map<string, StickerLayerSnapshot>();

export function readStickerLayerSnapshot(stickerId: string | null | undefined): StickerLayerSnapshot | null {
  if (!stickerId) return null;

  const memorySnapshot = memorySnapshots.get(stickerId);
  if (memorySnapshot) return memorySnapshot;

  const storage = browserStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(storageKey(stickerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StickerLayerSnapshot>;
    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      typeof parsed.baseDataUrl !== "string" ||
      typeof parsed.paintDataUrl !== "string" ||
      !parsed.workspace ||
      typeof parsed.workspace.width !== "number" ||
      typeof parsed.workspace.height !== "number"
    ) {
      return null;
    }
    if (parsed.textBox && !isStickerTextLayerSnapshot(parsed.textBox)) {
      return null;
    }
    const snapshot = parsed as StickerLayerSnapshot;
    memorySnapshots.set(stickerId, snapshot);
    return snapshot;
  } catch {
    return null;
  }
}

export function writeStickerLayerSnapshot(stickerId: string | null | undefined, snapshot: StickerLayerSnapshot): void {
  if (!stickerId) return;

  memorySnapshots.set(stickerId, snapshot);

  const storage = browserStorage();
  if (!storage) return;

  try {
    storage.setItem(storageKey(stickerId), JSON.stringify(snapshot));
  } catch {
    // High-resolution PNG layers can exceed localStorage quota. The in-memory copy still keeps re-editing working.
  }
}

export function deleteStickerLayerSnapshot(stickerId: string | null | undefined): void {
  if (!stickerId) return;

  memorySnapshots.delete(stickerId);

  const storage = browserStorage();
  if (!storage) return;

  try {
    storage.removeItem(storageKey(stickerId));
  } catch {
    // Ignore storage cleanup failures.
  }
}

export function moveDraftStickerLayerSnapshot(stickerId: string): void {
  const draft = readStickerLayerSnapshot(DRAFT_STICKER_LAYER_ID);
  if (!draft) return;

  writeStickerLayerSnapshot(stickerId, {...draft, updatedAt: Date.now()});
  deleteStickerLayerSnapshot(DRAFT_STICKER_LAYER_ID);
}

export function draftStickerEditorUpload(): StickerEditorUpload | undefined {
  const snapshot = readStickerLayerSnapshot(DRAFT_STICKER_LAYER_ID);
  if (!snapshot || snapshot.version !== 2) return undefined;
  return {
    version: 2,
    baseImageDataUrl: snapshot.baseDataUrl,
    paintImageDataUrl: snapshot.paintDataUrl,
    workspace: {...snapshot.workspace},
    outlineWidth: snapshot.style?.outlineWidth ?? 0,
    ...(snapshot.textBox ? {textBox: {...snapshot.textBox}} : {}),
  };
}

function storageKey(stickerId: string): string {
  return `${STORAGE_PREFIX}${stickerId}`;
}

function isStickerTextLayerSnapshot(value: unknown): value is StickerTextLayerSnapshot {
  if (!value || typeof value !== "object") return false;
  const textBox = value as Partial<StickerTextLayerSnapshot>;
  return typeof textBox.text === "string"
    && isFiniteNumber(textBox.x)
    && isFiniteNumber(textBox.y)
    && isFiniteNumber(textBox.boxWidth)
    && isFiniteNumber(textBox.boxHeight)
    && isFiniteNumber(textBox.fontSize)
    && (textBox.lineHeight === undefined || isFiniteNumber(textBox.lineHeight))
    && typeof textBox.color === "string"
    && (textBox.align === "left" || textBox.align === "center" || textBox.align === "right")
    && (textBox.verticalAlign === "top" || textBox.verticalAlign === "middle" || textBox.verticalAlign === "bottom");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
