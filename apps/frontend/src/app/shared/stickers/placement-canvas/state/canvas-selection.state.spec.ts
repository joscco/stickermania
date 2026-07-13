import {CanvasSelectionState} from "./canvas-selection.state";

describe("CanvasSelectionState", () => {
  it("selects a single id in auto mode", () => {
    const state = new CanvasSelectionState();

    state.selectIds(["a"]);

    expect(state.selectedInstanceId()).toBe("a");
    expect(state.multiSelection().size).toBe(0);
    expect(state.selectionIds()).toEqual(["a"]);
  });

  it("keeps one id as multi-selection when requested", () => {
    const state = new CanvasSelectionState();

    state.selectIds(["a"], "multi");

    expect(state.selectedInstanceId()).toBeNull();
    expect([...state.multiSelection()]).toEqual(["a"]);
    expect(state.selectionIds()).toEqual(["a"]);
  });

  it("clears selection and rotation when selecting no ids", () => {
    const state = new CanvasSelectionState();
    state.selectIds(["a", "b"], "multi");
    state.multiSelectionRotation.set(45);

    state.selectIds([]);

    expect(state.hasSelection()).toBe(false);
    expect(state.selectionIds()).toEqual([]);
    expect(state.multiSelectionRotation()).toBe(0);
  });
});
