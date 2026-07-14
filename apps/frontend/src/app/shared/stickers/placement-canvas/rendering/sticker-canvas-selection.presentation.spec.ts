import type {StickerPlacement} from "@stickermania/shared";
import {CanvasSelectionState} from "../state/canvas-selection.state";
import {StickerCanvasOverlayInteractionState} from "../state/sticker-canvas-overlay-interaction.state";
import {StickerCanvasSelectionPresentation} from "./sticker-canvas-selection.presentation";

describe("StickerCanvasSelectionPresentation", () => {
  it("presents an editable selection with overlay and edit action bar", () => {
    const selection = new CanvasSelectionState();
    const presentation = createPresentation(selection, [placement()]);

    selection.selectSingle("placement");

    expect(presentation.overlayVisible()).toBe(true);
    expect(presentation.actionBarVisible()).toBe(true);
    expect(presentation.actionBarMode()).toBe("edit");
    expect(presentation.actionBarCenterX()).toBe(100);
  });

  it("presents an unlockable locked sticker without an edit overlay", () => {
    const selection = new CanvasSelectionState();
    const presentation = createPresentation(selection, [placement({locked: true})]);

    presentation.lockedActionBarPlacementId.set("placement");

    expect(presentation.overlayVisible()).toBe(false);
    expect(presentation.actionBarVisible()).toBe(true);
    expect(presentation.actionBarMode()).toBe("locked");
  });

  it("hides selection controls in readonly mode", () => {
    const selection = new CanvasSelectionState();
    const presentation = createPresentation(selection, [placement()], true);
    selection.selectSingle("placement");

    expect(presentation.overlayVisible()).toBe(false);
    expect(presentation.actionBarVisible()).toBe(false);
  });
});

function createPresentation(
  selectionState: CanvasSelectionState,
  placements: StickerPlacement[],
  readonlyMode = false,
): StickerCanvasSelectionPresentation {
  return new StickerCanvasSelectionPresentation({
    placements: () => placements,
    catalogById: () => new Map([["sticker", {id: "sticker", imageUrl: "sprite:#sticker"}]]),
    stickerSizePx: () => 100,
    alphaBounds: () => new Map(),
    readonlyMode: () => readonlyMode,
    showActionBar: () => true,
    editablePlacementIds: () => null,
    unlockablePlacementIds: () => null,
    getRenderedSize: () => ({width: 100, height: 100}),
    selectionState,
    overlayInteraction: new StickerCanvasOverlayInteractionState(),
  });
}

function placement(overrides: Partial<StickerPlacement & {locked: boolean}> = {}): StickerPlacement {
  return {
    instanceId: "placement",
    stickerId: "sticker",
    x: 100,
    y: 80,
    rotation: 0,
    scale: 1,
    zIndex: 1,
    ...overrides,
  } as StickerPlacement;
}
