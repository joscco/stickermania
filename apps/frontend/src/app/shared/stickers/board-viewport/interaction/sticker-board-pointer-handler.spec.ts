import {describe, expect, it, vi} from "vitest";
import {StickerBoardPointerHandler} from "./sticker-board-pointer-handler";
import type {StickerBoardCameraController} from "../camera/sticker-board-camera.controller";
import {markStickerCanvasPointerHit} from "../../placement-canvas/interaction/sticker-hit-test.util";

describe("StickerBoardPointerHandler", () => {
  it("starts board panning from a non-editable sticker", () => {
    const setup = createHandler({editableIds: new Set(["own"])});
    const event = pointerEvent({pointerId: 1, targetInstanceId: "foreign"});

    setup.handler.pointerDown(event);

    expect(setup.clearSelection).toHaveBeenCalled();
    expect(setup.camera.startPointer).toHaveBeenCalledWith(1, {x: 40, y: 60});
    expect(setup.viewport.setPointerCapture).toHaveBeenCalledWith(1);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("promotes a touch on an editable sticker to board pinch when a second finger lands", () => {
    const setup = createHandler({editableIds: new Set(["own"])});

    setup.handler.pointerDown(pointerEvent({pointerId: 1, pointerType: "touch", targetInstanceId: "own", clientX: 30, clientY: 40}));
    const second = pointerEvent({pointerId: 2, pointerType: "touch", targetInstanceId: "own", clientX: 130, clientY: 140});
    setup.handler.pointerDown(second);

    expect(setup.cancelStickerGesture).toHaveBeenCalled();
    expect(setup.camera.cancelGesture).toHaveBeenCalledWith();
    expect(setup.camera.startPointer).toHaveBeenCalledWith(1, {x: 30, y: 40});
    expect(setup.camera.startPointer).toHaveBeenCalledWith(2, {x: 130, y: 140});
    expect(second.preventDefault).toHaveBeenCalled();
  });

  it("keeps board pinch priority when the second finger lands on an editable sticker", () => {
    const setup = createHandler({editableIds: new Set(["own"])});

    setup.handler.pointerDown(pointerEvent({pointerId: 1, pointerType: "touch", clientX: 30, clientY: 40}));
    const second = pointerEvent({pointerId: 2, pointerType: "touch", targetInstanceId: "own", clientX: 130, clientY: 140});
    setup.handler.pointerDown(second);

    expect(setup.cancelStickerGesture).toHaveBeenCalled();
    expect(setup.camera.startPointer).toHaveBeenCalledWith(1, {x: 30, y: 40});
    expect(setup.camera.startPointer).toHaveBeenCalledWith(2, {x: 130, y: 140});
    expect(second.preventDefault).toHaveBeenCalled();
  });

  function createHandler(options: {editableIds: Set<string>}) {
    const camera = {
      cancelCameraTween: vi.fn(),
      cancelGesture: vi.fn(),
      startPointer: vi.fn(),
      movePointer: vi.fn(() => false),
      endPointer: vi.fn(),
    } as unknown as StickerBoardCameraController;
    const viewport = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 400}),
      setPointerCapture: vi.fn(),
    } as unknown as HTMLElement;
    const clearSelection = vi.fn();
    const cancelStickerGesture = vi.fn();
    const handler = new StickerBoardPointerHandler({
      camera,
      viewportElement: () => viewport,
      readonlyMode: () => false,
      zoomEnabled: () => true,
      isPanning: () => false,
      isPlacementEditable: instanceId => options.editableIds.has(instanceId),
      clearSelection,
      cancelStickerGesture,
      nonEditablePlacementTapped: vi.fn(),
    });

    return {camera, cancelStickerGesture, clearSelection, handler, viewport};
  }

  function pointerEvent(options: {
    pointerId: number;
    pointerType?: string;
    targetInstanceId?: string;
    clientX?: number;
    clientY?: number;
  }): PointerEvent & {preventDefault: ReturnType<typeof vi.fn>} {
    const event = {
      button: 0,
      clientX: options.clientX ?? 40,
      clientY: options.clientY ?? 60,
      pointerId: options.pointerId,
      pointerType: options.pointerType ?? "touch",
      preventDefault: vi.fn(),
      target: {closest: () => null},
    } as unknown as PointerEvent & {preventDefault: ReturnType<typeof vi.fn>};

    if (options.targetInstanceId) {
      markStickerCanvasPointerHit(event, {
        instanceId: options.targetInstanceId,
        handledByCanvas: true,
      });
    }

    return event;
  }
});
