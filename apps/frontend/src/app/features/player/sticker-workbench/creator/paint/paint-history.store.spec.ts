import {describe, expect, it} from "vitest";
import {PaintHistoryStore, type PaintHistorySnapshot} from "./paint-history.store";

const snapshot = (id: string): PaintHistorySnapshot => ({
  baseDataUrl: `base:${id}`,
  paintDataUrl: `paint:${id}`,
});

describe("PaintHistoryStore", () => {
  it("keeps only the newest snapshots up to the configured limit", () => {
    const store = new PaintHistoryStore(3);

    store.push(snapshot("1"));
    store.push(snapshot("2"));
    store.push(snapshot("3"));
    store.push(snapshot("4"));

    expect(store.size).toBe(3);
    expect(store.pop()).toEqual(snapshot("4"));
    expect(store.pop()).toEqual(snapshot("3"));
    expect(store.pop()).toEqual(snapshot("2"));
    expect(store.pop()).toBeNull();
  });

  it("tracks whether undo is available", () => {
    const store = new PaintHistoryStore();

    expect(store.canUndo).toBe(false);

    store.push(snapshot("1"));
    expect(store.canUndo).toBe(true);

    store.pop();
    expect(store.canUndo).toBe(false);
  });

  it("can discard the latest snapshot when an attempted edit is not applied", () => {
    const store = new PaintHistoryStore();

    store.push(snapshot("before-noop"));
    store.discardLatest();

    expect(store.canUndo).toBe(false);
    expect(store.pop()).toBeNull();
  });
});
