import {alphaMaskBounds, outsetNormalizedBounds, type StickerAlphaMask} from "./sticker-alpha-mask";

describe("sticker-alpha-mask", () => {
  it("derives tight normalized bounds from opaque alpha pixels", () => {
    const bounds = alphaMaskBounds(alphaMask([
      ".....",
      "..#..",
      ".###.",
      "..#..",
      ".....",
    ]));

    expect(bounds).toEqual({
      x: 1 / 5,
      y: 1 / 5,
      w: 3 / 5,
      h: 3 / 5,
    });
  });

  it("keeps disconnected opaque alpha islands inside one tight rectangle", () => {
    const bounds = alphaMaskBounds(alphaMask([
      ".....",
      ".#.#.",
      ".....",
    ]));

    expect(bounds).toEqual({
      x: 1 / 5,
      y: 1 / 3,
      w: 3 / 5,
      h: 1 / 3,
    });
  });

  it("offsets normalized bounds outward in rendered pixel space", () => {
    const bounds = outsetNormalizedBounds({x: 0.25, y: 0.25, w: 0.5, h: 0.5}, 10, 100, 100);

    expect(bounds).toEqual({x: 0.15, y: 0.15, w: 0.7, h: 0.7});
  });
});

function alphaMask(rows: string[]): StickerAlphaMask {
  const width = rows[0]?.length ?? 0;
  const height = rows.length;
  const alpha = new Uint8ClampedArray(width * height * 4);

  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      alpha[(y * width + x) * 4 + 3] = cell === "#" ? 255 : 0;
    });
  });

  return {
    stickerId: "sticker",
    sourceUrl: "test",
    width,
    height,
    alpha,
  };
}
