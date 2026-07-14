import type {PlayerSticker} from "@stickermania/shared";
import type {StickerCreatorResult} from "../shared/sticker-creator-types";

export type PaintCreateStatus = "idle" | "saving" | "saved" | "error";

type WritableValue<T> = {
  (): T;
  set(value: T): void;
};

export class PaintSubmissionController {
  private lastStickerCount = 0;
  private statusClearTimer: ReturnType<typeof setTimeout> | null = null;
  private prepareTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSavedSignalAt = 0;
  private saveSubmittedFromEditor = false;
  private submittedStickerDataUrl: string | null = null;
  private submittedStickerHadLocalMatch = false;

  constructor(private readonly options: {
    stickers: () => PlayerSticker[];
    previewReady: WritableValue<boolean>;
    previewDataUrl: WritableValue<string | null>;
    pendingStickerDataUrl: WritableValue<string | null>;
    stickerPreparing: WritableValue<boolean>;
    statusText: WritableValue<string>;
    updateCompositePreview: () => void;
    persistDraftLayers: () => void;
    hidePointerPreview: () => void;
    closeToolbar: () => void;
    normalizedStickerName: () => string;
    createSticker: (result: StickerCreatorResult) => void;
    afterStickerSaved: () => void;
  }) {}

  observeStickerList(): void {
    const count = this.options.stickers().length;
    const submittedStickerVisible = !!this.submittedStickerDataUrl
      && !this.submittedStickerHadLocalMatch
      && this.options.stickers().some(sticker => sticker.imageUrl === this.submittedStickerDataUrl);

    if (
      this.saveSubmittedFromEditor
      && this.options.statusText() === "Sticker wird gespeichert..."
      && (count > this.lastStickerCount || submittedStickerVisible)
    ) {
      this.markStickerSaved();
    }

    this.lastStickerCount = count;
  }

  observeCreateStatus(status: PaintCreateStatus): void {
    if (!this.saveSubmittedFromEditor) return;

    switch (status) {
      case "saving":
        this.options.statusText.set("Sticker wird gespeichert...");
        break;
      case "saved":
        this.markStickerSaved();
        break;
      case "error":
        this.options.statusText.set("Sticker konnte nicht gespeichert werden. Bitte versuch es nochmal.");
        this.clearSubmittedSticker();
        break;
      case "idle":
        break;
    }
  }

  confirmSticker(): void {
    if (!this.options.previewReady()) return;
    if (this.options.stickerPreparing()) return;

    this.options.stickerPreparing.set(true);
    this.options.statusText.set("Sticker wird vorbereitet...");
    this.clearStatusTimer();

    this.prepareTimer = setTimeout(() => {
      this.prepareTimer = null;
      this.options.updateCompositePreview();
      this.options.persistDraftLayers();
      const dataUrl = this.options.previewDataUrl();
      this.options.stickerPreparing.set(false);

      if (!dataUrl) {
        this.options.statusText.set("Sticker ist noch leer.");
        this.scheduleStatusClear();
        return;
      }

      this.options.pendingStickerDataUrl.set(dataUrl);
      this.options.closeToolbar();
      this.options.hidePointerPreview();
      this.options.statusText.set("");
    }, 0);
  }

  submitPendingSticker(): void {
    const dataUrl = this.options.pendingStickerDataUrl();
    if (!dataUrl) return;

    this.saveSubmittedFromEditor = true;
    this.submittedStickerDataUrl = dataUrl;
    this.submittedStickerHadLocalMatch = this.options.stickers().some(sticker => sticker.imageUrl === dataUrl);
    this.options.createSticker({dataUrl, name: this.options.normalizedStickerName()});
    this.options.statusText.set("Sticker wird gespeichert...");
    this.clearStatusTimer();
  }

  reset(): void {
    this.options.pendingStickerDataUrl.set(null);
    this.options.statusText.set("");
    this.options.stickerPreparing.set(false);
    this.clearSubmittedSticker();
    this.clearStatusTimer();
    this.clearPrepareTimer();
  }

  destroy(): void {
    this.clearStatusTimer();
    this.clearPrepareTimer();
  }

  private markStickerSaved(): void {
    const now = Date.now();
    if (now - this.lastSavedSignalAt < 300) return;

    this.lastSavedSignalAt = now;
    this.clearSubmittedSticker();
    this.options.afterStickerSaved();
    this.options.statusText.set("Sticker gespeichert.");
    this.scheduleStatusClear();
  }

  private clearSubmittedSticker(): void {
    this.saveSubmittedFromEditor = false;
    this.submittedStickerDataUrl = null;
    this.submittedStickerHadLocalMatch = false;
  }

  private scheduleStatusClear(): void {
    this.clearStatusTimer();
    this.statusClearTimer = setTimeout(() => {
      const status = this.options.statusText();
      if (status === "Sticker gespeichert." || status === "Sticker ist noch leer.") {
        this.options.statusText.set("");
      }
      this.statusClearTimer = null;
    }, 1000);
  }

  private clearStatusTimer(): void {
    if (!this.statusClearTimer) return;
    clearTimeout(this.statusClearTimer);
    this.statusClearTimer = null;
  }

  private clearPrepareTimer(): void {
    if (!this.prepareTimer) return;
    clearTimeout(this.prepareTimer);
    this.prepareTimer = null;
  }
}
