import {signal} from "@angular/core";
import type {StickerAlphaMask} from "../../model/sticker-alpha-mask";
import {vi} from "vitest";
import {StickerAlphaMaskPreloader} from "./sticker-alpha-mask-preloader";

describe("StickerAlphaMaskPreloader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("loads each used sticker once and ignores unused catalog entries", () => {
    const loaded: string[] = [];
    const masks = new Map<string, StickerAlphaMask>();
    const cache = {
      revision: signal(0),
      get: (id: string) => masks.get(id) ?? null,
      ensureLoaded: (sticker: {id: string}) => loaded.push(sticker.id),
      clear: () => masks.clear(),
    };
    const preloader = new StickerAlphaMaskPreloader(
      () => [
        {id: "used", imageUrl: "sprite:#used"},
        {id: "unused", imageUrl: "sprite:#unused"},
      ],
      cache,
    );

    preloader.sync([
      placement("first", "used"),
      placement("second", "used"),
    ], true);
    vi.advanceTimersByTime(500);

    expect(loaded).toEqual(["used"]);
  });

  it("cancels pending loads when editing is disabled", () => {
    const loaded: string[] = [];
    const cache = {
      revision: signal(0),
      get: () => null,
      ensureLoaded: (sticker: {id: string}) => loaded.push(sticker.id),
      clear: () => undefined,
    };
    const preloader = new StickerAlphaMaskPreloader(
      () => [{id: "sticker", imageUrl: "sprite:#sticker"}],
      cache,
    );

    preloader.sync([placement("placement", "sticker")], true);
    preloader.sync([placement("placement", "sticker")], false);
    vi.advanceTimersByTime(500);

    expect(loaded).toEqual([]);
  });
});

function placement(instanceId: string, stickerId: string) {
  return {instanceId, stickerId, x: 0, y: 0, rotation: 0, scale: 1, zIndex: 1};
}
