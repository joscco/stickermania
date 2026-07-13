import {describe, expect, it} from "vitest";
import {boundedStickerOutputSize, MAX_STICKER_OUTPUT_SIZE_PX} from "./sticker-output-canvas";

describe("boundedStickerOutputSize", () => {
  it("keeps smaller sticker output unchanged", () => {
    expect(boundedStickerOutputSize({width: 320, height: 480})).toEqual({width: 320, height: 480});
  });

  it("scales landscape output down to a maximum side of 750px", () => {
    expect(boundedStickerOutputSize({width: 1500, height: 500})).toEqual({width: MAX_STICKER_OUTPUT_SIZE_PX, height: 250});
  });

  it("scales portrait output down to a maximum side of 750px", () => {
    expect(boundedStickerOutputSize({width: 500, height: 1500})).toEqual({width: 250, height: MAX_STICKER_OUTPUT_SIZE_PX});
  });
});
