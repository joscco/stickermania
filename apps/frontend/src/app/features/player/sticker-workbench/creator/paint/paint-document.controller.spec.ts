import {describe, expect, it, vi} from "vitest";

import {PaintDocumentController} from "./paint-document.controller";

describe("PaintDocumentController", () => {
  it("owns layer history independently from the workspace", () => {
    const document = createDocument();
    const base = layerCanvas("base-1");
    const paint = layerCanvas("paint-1");
    document.open(base, paint);

    expect(document.baseCanvas).toBe(base);
    expect(document.paintCanvas).toBe(paint);
    expect(document.canUndo).toBe(false);

    expect(document.pushHistory()).toBe(true);
    expect(document.canUndo).toBe(true);

    document.discardLatestHistory();
    expect(document.canUndo).toBe(false);
  });

  it("clears layers, history, and preview state together", () => {
    const setPreviewReady = vi.fn();
    const setPreviewDataUrl = vi.fn();
    const document = createDocument({setPreviewReady, setPreviewDataUrl});
    document.open(layerCanvas("base"), layerCanvas("paint"));
    document.pushHistory();

    document.reset();

    expect(document.baseCanvas).toBeNull();
    expect(document.paintCanvas).toBeNull();
    expect(document.canUndo).toBe(false);
    expect(setPreviewReady).toHaveBeenLastCalledWith(false);
    expect(setPreviewDataUrl).toHaveBeenLastCalledWith(null);
  });
});

function createDocument(overrides: Partial<ConstructorParameters<typeof PaintDocumentController>[0]> = {}): PaintDocumentController {
  return new PaintDocumentController({
    outlineWidth: () => 0,
    textBox: () => null,
    setPreviewReady: vi.fn(),
    setPreviewDataUrl: vi.fn(),
    ...overrides,
  });
}

function layerCanvas(dataUrl: string): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
    toDataURL: vi.fn(() => dataUrl),
  } as unknown as HTMLCanvasElement;
}
