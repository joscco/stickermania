import type {BoardStickerPlacement} from "@stickermania/shared";

import type {BoardPlacementPatch} from "./board-placement-patch";

export class BoardPlacementPatchAccumulator {
  private readonly pendingUpserts = new Map<string, BoardStickerPlacement>();
  private readonly pendingDeletes = new Set<string>();

  queue(upserts: BoardStickerPlacement[], deletes: string[]): void {
    for (const instanceId of deletes) {
      this.pendingUpserts.delete(instanceId);
      this.pendingDeletes.add(instanceId);
    }

    for (const placement of upserts) {
      this.pendingDeletes.delete(placement.instanceId);
      this.pendingUpserts.set(placement.instanceId, placement);
    }
  }

  take(): BoardPlacementPatch {
    const patch = this.snapshot();
    this.clear();
    return patch;
  }

  snapshot(): BoardPlacementPatch {
    return {
      upserts: [...this.pendingUpserts.values()],
      deletes: [...this.pendingDeletes.values()],
    };
  }

  clear(): void {
    this.pendingUpserts.clear();
    this.pendingDeletes.clear();
  }

  hasPending(): boolean {
    return this.pendingUpserts.size > 0 || this.pendingDeletes.size > 0;
  }
}
