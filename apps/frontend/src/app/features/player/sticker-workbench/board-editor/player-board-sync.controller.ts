import type {BoardStickerPlacement} from "@stickermania/shared";
import {
  boardPlacementListSignature,
  diffBoardPlacementPatch,
  mergeIncomingWithLocalBoardPatch,
  type BoardPlacementPatch,
} from "../../../../shared/stickers/board-viewport/sync/board-placement-patch";
import {BoardPlacementPatchAccumulator} from "../../../../shared/stickers/board-viewport/sync/board-placement-patch-accumulator";

export type PlayerBoardSaveState = "idle" | "saving" | "saved" | "error";

export type PlayerBoardSyncControllerOptions = {
  getEditorPlacements: () => BoardStickerPlacement[];
  setEditorPlacements: (placements: BoardStickerPlacement[]) => void;
  normalizePlacements: (placements: BoardStickerPlacement[]) => BoardStickerPlacement[];
  isLocalPlacement: (placement: BoardStickerPlacement) => boolean;
  emitPatch: (patch: BoardPlacementPatch) => void;
  setSaveState: (state: PlayerBoardSaveState) => void;
  saveTimeoutMs?: number;
  savedResetDelayMs?: number;
};

export class PlayerBoardSyncController {
  private lastBoardInputSignature = "";
  private boardTransformDirty = false;
  private awaitingBoardAck = false;
  private saveState: PlayerBoardSaveState = "idle";
  private saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingPatch = new BoardPlacementPatchAccumulator();

  constructor(private readonly options: PlayerBoardSyncControllerOptions) {}

  syncIncomingPlacements(incomingPlacements: BoardStickerPlacement[]): void {
    const incomingSignature = boardPlacementListSignature(incomingPlacements);

    if (this.hasLocalBoardPatch()) {
      const mergedPlacements = mergeIncomingWithLocalBoardPatch(
        incomingPlacements,
        this.options.getEditorPlacements(),
        this.options.isLocalPlacement,
      );

      const mergedSignature = boardPlacementListSignature(mergedPlacements);

      if (mergedSignature !== this.lastBoardInputSignature) {
        const normalizedPlacements = this.options.normalizePlacements(mergedPlacements);
        this.lastBoardInputSignature = boardPlacementListSignature(normalizedPlacements);
        this.options.setEditorPlacements(normalizedPlacements);
      }

      if (this.awaitingBoardAck) {
        this.markBoardSaveConfirmed();
      }

      return;
    }

    if (incomingSignature === this.lastBoardInputSignature) {
      if (this.awaitingBoardAck) {
        this.markBoardSaveConfirmed();
      }

      return;
    }

    const normalizedPlacements = this.options.normalizePlacements(incomingPlacements);
    this.lastBoardInputSignature = boardPlacementListSignature(normalizedPlacements);
    this.options.setEditorPlacements(normalizedPlacements);

    if (this.awaitingBoardAck) {
      this.markBoardSaveConfirmed();
    }
  }

  applyLocalPlacements(
    nextPlacements: BoardStickerPlacement[],
    options: {flushImmediately: boolean},
  ): void {
    const previousPlacements = this.options.getEditorPlacements();
    const normalizedPlacements = this.options.normalizePlacements(nextPlacements);

    this.lastBoardInputSignature = boardPlacementListSignature(normalizedPlacements);
    this.options.setEditorPlacements(normalizedPlacements);
    this.boardTransformDirty = true;

    const patch = diffBoardPlacementPatch(previousPlacements, normalizedPlacements);
    this.queueBoardPatch(patch.upserts, patch.deletes);

    if (options.flushImmediately) {
      this.boardTransformDirty = false;
      this.flushBoardPatch();
    }
  }

  finishActiveTransform(): void {
    if (!this.boardTransformDirty) {
      return;
    }

    this.boardTransformDirty = false;
    this.flushBoardPatch();
  }

  flushPendingChanges(): void {
    if (!this.hasLocalBoardPatch()) {
      return;
    }

    this.boardTransformDirty = false;
    this.flushBoardPatch();
  }

  hasLocalBoardPatch(): boolean {
    return this.boardTransformDirty || this.pendingPatch.hasPending();
  }

  dispose(): void {
    if (this.saveStatusTimer) {
      clearTimeout(this.saveStatusTimer);
      this.saveStatusTimer = null;
    }

    this.pendingPatch.clear();
    this.boardTransformDirty = false;
    this.awaitingBoardAck = false;
  }

  private queueBoardPatch(upserts: BoardStickerPlacement[], deletes: string[]): void {
    this.pendingPatch.queue(upserts, deletes);
  }

  private flushBoardPatch(): void {
    const {upserts, deletes} = this.pendingPatch.take();

    if (upserts.length === 0 && deletes.length === 0) {
      return;
    }

    this.awaitingBoardAck = true;
    this.setSaveState("saving");
    this.scheduleSaveStatusReset(this.options.saveTimeoutMs ?? 4500, "error");

    this.options.emitPatch({
      upserts,
      deletes,
    });
  }

  private markBoardSaveConfirmed(): void {
    this.awaitingBoardAck = false;
    this.boardTransformDirty = false;
    this.setSaveState("saved");
    this.scheduleSaveStatusReset(this.options.savedResetDelayMs ?? 1200);
  }

  private scheduleSaveStatusReset(
    delayMs: number,
    fallbackState: PlayerBoardSaveState = "idle",
  ): void {
    if (this.saveStatusTimer) {
      clearTimeout(this.saveStatusTimer);
    }

    this.saveStatusTimer = setTimeout(() => {
      this.saveStatusTimer = null;

      if (fallbackState === "error" && this.saveState !== "saving") {
        return;
      }

      this.setSaveState(fallbackState);

      if (fallbackState === "error") {
        this.awaitingBoardAck = false;
      }
    }, delayMs);
  }

  private setSaveState(state: PlayerBoardSaveState): void {
    this.saveState = state;
    this.options.setSaveState(state);
  }
}
