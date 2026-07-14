import type {BoardStickerPlacement} from "@stickermania/shared";
import {
  boardPlacementListSignature,
  boardPlacementSignature,
  diffBoardPlacementPatch,
  mergeIncomingWithLocalBoardPatch,
} from "./board-placement-patch";

describe("board-placement-patch", () => {
  it("normalizes placement signatures to transport-relevant fields", () => {
    const base = placement({x: 10.004, y: 20.004, rotation: 1.004, scale: 1.0004, updatedAt: 1, groupId: "a"});
    const equivalent = placement({x: 10.001, y: 20.001, rotation: 1.001, scale: 1.0001, updatedAt: 2, groupId: "b"});

    expect(boardPlacementSignature(base)).toEqual(boardPlacementSignature(equivalent));
  });

  it("creates order-independent list signatures", () => {
    const first = placement({instanceId: "a", zIndex: 1});
    const second = placement({instanceId: "b", zIndex: 2});

    expect(boardPlacementListSignature([first, second])).toEqual(boardPlacementListSignature([second, first]));
  });

  it("diffs upserts and deletes", () => {
    const previous = [
      placement({instanceId: "kept", x: 1}),
      placement({instanceId: "changed", x: 2}),
      placement({instanceId: "deleted", x: 3}),
    ];
    const next = [
      placement({instanceId: "kept", x: 1}),
      placement({instanceId: "changed", x: 2.5}),
      placement({instanceId: "created", x: 4}),
    ];

    expect(diffBoardPlacementPatch(previous, next)).toEqual({
      upserts: [next[1], next[2]],
      deletes: ["deleted"],
    });
  });

  it("can restrict diffs to a subset of placements", () => {
    const previous = [
      placement({instanceId: "own", placedByPlayerId: "me", x: 1}),
      placement({instanceId: "other", placedByPlayerId: "them", x: 1}),
    ];
    const next = [
      placement({instanceId: "own", placedByPlayerId: "me", x: 2}),
      placement({instanceId: "other", placedByPlayerId: "them", x: 2}),
    ];

    expect(diffBoardPlacementPatch(previous, next, item => item.placedByPlayerId === "me")).toEqual({
      upserts: [next[0]],
      deletes: [],
    });
  });

  it("merges incoming data with local pending placements", () => {
    const incoming = [
      placement({instanceId: "remote", placedByPlayerId: "them", zIndex: 3}),
      placement({instanceId: "own", placedByPlayerId: "me", x: 10, zIndex: 1}),
    ];
    const local = [
      placement({instanceId: "own", placedByPlayerId: "me", x: 99, zIndex: 2}),
    ];

    const merged = mergeIncomingWithLocalBoardPatch(incoming, local, item => item.placedByPlayerId === "me");

    expect(merged.map(item => [item.instanceId, item.x])).toEqual([
      ["own", 99],
      ["remote", 0],
    ]);
    expect(merged[0]).not.toBe(local[0]);
    expect(merged[1]).not.toBe(incoming[0]);
  });
});

function placement(overrides: Partial<BoardStickerPlacement> = {}): BoardStickerPlacement {
  return {
    instanceId: "placement",
    stickerId: "sticker",
    ownerPlayerId: overrides.placedByPlayerId ?? "player",
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
