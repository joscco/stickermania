type RgbaColor = {r: number; g: number; b: number; a: number};
export type PixelTuple = readonly [number, number, number, number];
const FILL_TARGET_TOLERANCE = 56;
const FILL_EDGE_TOLERANCE = 220;
const FILL_EDGE_ALPHA_TOLERANCE = 160;
const FILL_EDGE_EXPANSION_PX = 4;

export function fillPaintLayerAtPoint(
  base: HTMLCanvasElement,
  paint: HTMLCanvasElement,
  x: number,
  y: number,
  color: string,
): boolean {
  const width = base.width;
  const height = base.height;
  const fillX = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const fillY = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const compositeCtx = composite.getContext("2d");
  const paintCtx = paint.getContext("2d");
  if (!compositeCtx || !paintCtx) return false;

  compositeCtx.clearRect(0, 0, width, height);
  compositeCtx.drawImage(base, 0, 0);
  compositeCtx.drawImage(paint, 0, 0);
  const compositeData = compositeCtx.getImageData(0, 0, width, height);
  const targetOffset = (fillY * width + fillX) * 4;
  const target = [
    compositeData.data[targetOffset],
    compositeData.data[targetOffset + 1],
    compositeData.data[targetOffset + 2],
    compositeData.data[targetOffset + 3],
  ] as const;

  const fillMask = connectedSimilarPixels(compositeData.data, width, height, fillX, fillY, target);
  if (!fillMask) return false;

  expandFillMaskEdge(compositeData.data, width, height, fillMask, target);

  const fillColor = hexToRgba(color);
  const paintData = paintCtx.getImageData(0, 0, width, height);
  for (let index = 0; index < fillMask.length; index++) {
    if (!fillMask[index]) continue;
    const offset = index * 4;
    paintData.data[offset] = fillColor.r;
    paintData.data[offset + 1] = fillColor.g;
    paintData.data[offset + 2] = fillColor.b;
    paintData.data[offset + 3] = fillColor.a;
  }
  paintCtx.putImageData(paintData, 0, 0);
  return true;
}

export function connectedSimilarPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  target: PixelTuple,
): Uint8Array | null {
  const total = width * height;
  const visited = new Uint8Array(total);
  const mask = new Uint8Array(total);
  const stack = new Int32Array(total);
  let stackLength = 0;
  let filled = 0;
  const startIndex = startY * width + startX;
  stack[stackLength++] = startIndex;
  visited[startIndex] = 1;

  while (stackLength > 0) {
    const index = stack[--stackLength];
    const offset = index * 4;
    if (!pixelMatchesFillTarget(pixels, offset, target, FILL_TARGET_TOLERANCE)) continue;
    mask[index] = 1;
    filled++;

    const x = index % width;
    const left = index - 1;
    const right = index + 1;
    const top = index - width;
    const bottom = index + width;
    if (x > 0 && !visited[left]) {
      visited[left] = 1;
      stack[stackLength++] = left;
    }
    if (x < width - 1 && !visited[right]) {
      visited[right] = 1;
      stack[stackLength++] = right;
    }
    if (top >= 0 && !visited[top]) {
      visited[top] = 1;
      stack[stackLength++] = top;
    }
    if (bottom < total && !visited[bottom]) {
      visited[bottom] = 1;
      stack[stackLength++] = bottom;
    }
  }

  return filled > 0 ? mask : null;
}

export function expandFillMaskEdge(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  target: PixelTuple,
): void {
  const total = width * height;

  for (let iteration = 0; iteration < FILL_EDGE_EXPANSION_PX; iteration++) {
    const additions: number[] = [];

    for (let index = 0; index < total; index++) {
      if (mask[index]) continue;
      if (!hasMaskedNeighbor(mask, width, height, index)) continue;
      if (!pixelMatchesFillEdge(pixels, index * 4, target)) continue;
      additions.push(index);
    }

    if (additions.length === 0) {
      return;
    }

    for (const index of additions) {
      mask[index] = 1;
    }
  }
}

export function hexToRgba(hex: string): RgbaColor {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: 255,
  };
}

function pixelMatchesFillEdge(
  pixels: Uint8ClampedArray,
  offset: number,
  target: PixelTuple,
): boolean {
  // Flood-fill starts strict, then expands only a small fringe into
  // anti-aliased edge pixels. Strong color/alpha changes still stop the fill.
  const dr = pixels[offset] - target[0];
  const dg = pixels[offset + 1] - target[1];
  const db = pixels[offset + 2] - target[2];
  const da = Math.abs(pixels[offset + 3] - target[3]);
  return dr * dr + dg * dg + db * db <= FILL_EDGE_TOLERANCE * FILL_EDGE_TOLERANCE
    && da <= FILL_EDGE_ALPHA_TOLERANCE;
}

function pixelMatchesFillTarget(
  pixels: Uint8ClampedArray,
  offset: number,
  target: PixelTuple,
  tolerance: number,
): boolean {
  const dr = pixels[offset] - target[0];
  const dg = pixels[offset + 1] - target[1];
  const db = pixels[offset + 2] - target[2];
  const da = pixels[offset + 3] - target[3];
  return dr * dr + dg * dg + db * db + da * da <= tolerance * tolerance;
}

function hasMaskedNeighbor(mask: Uint8Array, width: number, height: number, index: number): boolean {
  const x = index % width;
  const y = Math.floor(index / width);
  return (x > 0 && !!mask[index - 1])
    || (x < width - 1 && !!mask[index + 1])
    || (y > 0 && !!mask[index - width])
    || (y < height - 1 && !!mask[index + width])
    || (x > 0 && y > 0 && !!mask[index - width - 1])
    || (x < width - 1 && y > 0 && !!mask[index - width + 1])
    || (x > 0 && y < height - 1 && !!mask[index + width - 1])
    || (x < width - 1 && y < height - 1 && !!mask[index + width + 1]);
}
