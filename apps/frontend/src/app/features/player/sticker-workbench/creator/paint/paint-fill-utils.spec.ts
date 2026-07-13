import {describe, expect, it} from "vitest";
import {expandFillMaskEdge, type PixelTuple} from "./paint-fill-utils";

describe("paint-fill-utils", () => {
  it("expands the fill mask into anti-aliased edge pixels without crossing strong borders", () => {
    const width = 7;
    const height = 1;
    const target: PixelTuple = [255, 255, 255, 255];
    const pixels = rgbaPixels([
      [255, 255, 255, 255],
      target,
      [226, 226, 226, 255],
      [190, 190, 190, 255],
      [162, 162, 162, 255],
      [17, 24, 39, 255],
      [255, 255, 255, 255],
    ]);
    const mask = new Uint8Array([1, 1, 0, 0, 0, 0, 0]);

    expandFillMaskEdge(pixels, width, height, mask, target);

    expect([...mask]).toEqual([1, 1, 1, 1, 1, 0, 0]);
  });

  it("expands into diagonal anti-aliased edge pixels", () => {
    const width = 3;
    const height = 3;
    const target: PixelTuple = [255, 255, 255, 255];
    const pixels = rgbaPixels([
      target, target, target,
      target, target, [180, 180, 180, 255],
      target, [180, 180, 180, 255], [180, 180, 180, 255],
    ]);
    const mask = new Uint8Array([
      1, 1, 0,
      1, 1, 0,
      0, 0, 0,
    ]);

    expandFillMaskEdge(pixels, width, height, mask, target);

    expect([...mask]).toEqual([
      1, 1, 1,
      1, 1, 1,
      1, 1, 1,
    ]);
  });
});

function rgbaPixels(pixels: PixelTuple[]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}
