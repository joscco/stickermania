import type {StickerPlacement} from "@birthday/shared";
import {StickerCanvasOverlayInteractionState} from "../state/sticker-canvas-overlay-interaction.state";
import {StickerCanvasEditController} from "./sticker-canvas-edit.controller";

describe("StickerCanvasEditController", () => {
  it("removes selected placements after scheduling their exit animation", () => {
    const state = controllerState({
      placements: [
        placement({instanceId: "a"}),
        placement({instanceId: "b"}),
      ],
      selectionIds: ["a"],
    });

    state.controller.actionBarAction("delete");

    expect(state.clearSelectionCount).toBe(1);
    expect(state.scheduledRemovalIds).toEqual(["a"]);
    expect(state.emittedPlacements.map(item => item.instanceId)).toEqual(["b"]);
  });

  it("duplicates selected placements, selects the copies and marks them as entering", () => {
    const state = controllerState({
      placements: [placement({instanceId: "a", x: 10, y: 20, zIndex: 1})],
      selectionIds: ["a"],
    });

    state.controller.actionBarAction("duplicate");

    expect(state.committedPlacements).toHaveLength(2);
    expect(state.selectedIds).toEqual(state.enteringIds);
    expect(state.selectedMode).toBe("auto");
    expect(state.enteringIds).toHaveLength(1);
    expect(state.committedPlacements[1]).toMatchObject({x: 26, y: 36, zIndex: 2});
  });

  it("ignores actions when the current selection is not editable", () => {
    const state = controllerState({
      placements: [placement({instanceId: "a"})],
      selectionIds: ["a"],
      canEdit: false,
    });

    state.controller.actionBarAction("delete");

    expect(state.clearSelectionCount).toBe(0);
    expect(state.emittedPlacements).toEqual([]);
  });
});

function controllerState(options: {
  placements: StickerPlacement[];
  selectionIds: string[];
  canEdit?: boolean;
}) {
  let placements = options.placements;
  const state = {
    committedPlacements: [] as StickerPlacement[],
    emittedPlacements: [] as StickerPlacement[],
    selectedIds: [] as string[],
    selectedMode: "" as "auto" | "multi" | "",
    enteringIds: [] as string[],
    settlingIds: [] as string[],
    scheduledRemovalIds: [] as string[],
    clearSelectionCount: 0,
    controller: null as unknown as StickerCanvasEditController,
  };

  state.controller = new StickerCanvasEditController({
    placements: () => placements,
    selectionIds: () => options.selectionIds,
    canEditPlacements: () => options.canEdit ?? true,
    overlayBox: () => ({x: 0, y: 0, w: 100, h: 100}),
    overlayRotation: () => 0,
    canvasRect: () => new DOMRect(0, 0, 500, 500),
    getRenderedSize: () => ({width: 100, height: 100}),
    minScale: () => 0.2,
    maxScale: () => 4,
    overlayInteraction: new StickerCanvasOverlayInteractionState(),
    commitPlacements: updated => {
      placements = updated;
      state.committedPlacements = updated;
    },
    emitPlacementsChanged: updated => {
      state.emittedPlacements = updated;
    },
    clearSelection: () => {
      state.clearSelectionCount += 1;
    },
    selectIds: (ids, mode) => {
      state.selectedIds = ids;
      state.selectedMode = mode;
    },
    setEntering: ids => {
      state.enteringIds = ids;
    },
    setSettling: ids => {
      state.settlingIds = ids;
    },
    scheduleRemoval: (ids, done) => {
      state.scheduledRemovalIds = ids;
      done();
    },
  });

  return state;
}

function placement(overrides: Partial<StickerPlacement> = {}): StickerPlacement {
  return {
    instanceId: "placement",
    stickerId: "sticker",
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    zIndex: 1,
    ...overrides,
  };
}
