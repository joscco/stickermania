import type {BoardStickerPlacement} from "@stickermania/shared";
import {describe, expect, it} from "vitest";

import {BoardPlacementPatchAccumulator} from "./board-placement-patch-accumulator";

describe("BoardPlacementPatchAccumulator", () => {
  it("keeps only the latest upsert for an instance", () => {
    const accumulator = new BoardPlacementPatchAccumulator();
    accumulator.queue([placement("one", 10)], []);
    accumulator.queue([placement("one", 20)], []);

    expect(accumulator.take()).toEqual({
      upserts: [placement("one", 20)],
      deletes: [],
    });
    expect(accumulator.hasPending()).toBe(false);
  });

  it("lets the latest operation win across upserts and deletes", () => {
    const accumulator = new BoardPlacementPatchAccumulator();
    accumulator.queue([placement("deleted", 10)], []);
    accumulator.queue([], ["deleted", "restored"]);
    accumulator.queue([placement("restored", 30)], []);

    expect(accumulator.snapshot()).toEqual({
      upserts: [placement("restored", 30)],
      deletes: ["deleted"],
    });
  });
});

function placement(instanceId: string, x: number): BoardStickerPlacement {
  return {
    instanceId,
    stickerId: "sticker",
    ownerPlayerId: "player",
    placedByPlayerId: "player",
    x,
    y: 0,
    rotation: 0,
    scale: 1,
    zIndex: 1,
    updatedAt: 1,
  };
}
