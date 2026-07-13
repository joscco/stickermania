import type {BoardPlacementPatch} from "./board-placement-patch";
import {BoardPlacementPatchAccumulator} from "./board-placement-patch-accumulator";

export type BoardPlacementPatchQueueOptions = {
  flushDelayMs: number;
  flush: (patch: BoardPlacementPatch) => void;
};

export class BoardPlacementPatchQueue {
  private readonly accumulator = new BoardPlacementPatchAccumulator();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: BoardPlacementPatchQueueOptions) {}

  queue(upserts: BoardPlacementPatch["upserts"], deletes: BoardPlacementPatch["deletes"]): void {
    this.accumulator.queue(upserts, deletes);
    this.scheduleFlush();
  }

  flush(): void {
    this.clearTimer();

    const patch = this.accumulator.take();
    if (patch.upserts.length === 0 && patch.deletes.length === 0) return;

    this.options.flush(patch);
  }

  clear(): void {
    this.clearTimer();
    this.accumulator.clear();
  }

  hasPending(): boolean {
    return this.accumulator.hasPending();
  }

  private scheduleFlush(): void {
    this.clearTimer();
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.options.flushDelayMs);
  }

  private clearTimer(): void {
    if (!this.flushTimer) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }
}
