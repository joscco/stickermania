import type {BoardStickerPlacement} from "@birthday/shared";
import {vi} from "vitest";
import {BoardPlacementPatchQueue} from "./board-placement-patch-queue";

describe("BoardPlacementPatchQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces pending upserts and deletes by placement id", () => {
    vi.useFakeTimers();
    const flushed: Array<{upserts: BoardStickerPlacement[]; deletes: string[]}> = [];
    const queue = new BoardPlacementPatchQueue({
      flushDelayMs: 100,
      flush: patch => flushed.push(patch),
    });

    queue.queue([placement({instanceId: "a", x: 1})], []);
    queue.queue([placement({instanceId: "a", x: 2}), placement({instanceId: "b"})], []);
    queue.queue([], ["b"]);
    queue.flush();

    expect(flushed).toEqual([{
      upserts: [placement({instanceId: "a", x: 2})],
      deletes: ["b"],
    }]);
    expect(queue.hasPending()).toBe(false);
  });

  it("flushes after the configured delay", () => {
    vi.useFakeTimers();
    const flushed: Array<{upserts: BoardStickerPlacement[]; deletes: string[]}> = [];
    const queue = new BoardPlacementPatchQueue({
      flushDelayMs: 100,
      flush: patch => flushed.push(patch),
    });

    queue.queue([placement({instanceId: "a"})], []);
    vi.advanceTimersByTime(99);
    expect(flushed).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(flushed).toEqual([{upserts: [placement({instanceId: "a"})], deletes: []}]);
  });
});

function placement(overrides: Partial<BoardStickerPlacement> = {}): BoardStickerPlacement {
  return {
    instanceId: "placement",
    stickerId: "sticker",
    ownerPlayerId: "player",
    placedByPlayerId: "player",
    updatedAt: 1,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    zIndex: 1,
    ...overrides,
  };
}
