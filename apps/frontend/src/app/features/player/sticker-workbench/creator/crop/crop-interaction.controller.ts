import {capturePointer, releasePointer} from "../../../../../shared/input/pointer-event-utils";
import type {PointerSurfaceHandler} from "../../../../../shared/input/pointer-surface-handler";
import type {TransformGestureController} from "../../../../../shared/input/transform-gesture.controller";
import type {CanvasPoint, CropMode} from "./crop-editor.types";
import type {CropSelectionCommandService} from "./crop-selection.commands";

export type CropInteractionControllerOptions = {
  isSourceLoaded: () => boolean;
  cropMode: () => CropMode;
  surface: () => HTMLCanvasElement | null;
  toCanvasPoint: (event: PointerEvent) => CanvasPoint;
  arrangeGestureController: TransformGestureController<CanvasPoint>;
  selectionCommandService: CropSelectionCommandService;
};

export class CropInteractionController implements PointerSurfaceHandler {
  constructor(private readonly options: CropInteractionControllerOptions) {}

  pointerDown(event: PointerEvent): void {
    if (!this.isAllowedPointerStart(event)) {
      return;
    }

    event.preventDefault();

    if (!this.options.isSourceLoaded()) {
      return;
    }

    const cropMode = this.options.cropMode();

    if (cropMode === "arrange") {
      this.options.arrangeGestureController.pointerDown(event);
      return;
    }

    const point = this.options.toCanvasPoint(event);

    if (cropMode === "polygon-lasso") {
      this.captureIfAccepted(
        event,
        this.options.selectionCommandService.handlePolygonPointerDown(point, event.pointerId),
      );
      return;
    }

    this.captureIfAccepted(
      event,
      this.options.selectionCommandService.startFreehandLasso(point, event.pointerId),
    );
  }

  pointerMove(event: PointerEvent): void {
    event.preventDefault();

    if (!this.options.isSourceLoaded()) {
      return;
    }

    const cropMode = this.options.cropMode();

    if (cropMode === "arrange") {
      this.options.arrangeGestureController.pointerMove(event);
      return;
    }

    const point = this.options.toCanvasPoint(event);

    if (cropMode === "polygon-lasso") {
      this.options.selectionCommandService.handlePolygonPointerMove(point, event.pointerId);
      return;
    }

    this.options.selectionCommandService.moveFreehandLasso(point, event.pointerId);
  }

  pointerUp(event: PointerEvent): void {
    if (this.options.cropMode() === "arrange") {
      this.options.arrangeGestureController.pointerUp(event);
      return;
    }

    event.preventDefault();
    this.releasePointer(event.pointerId);
    this.finishSelectionPointer(event.pointerId);
  }

  pointerCancel(event: PointerEvent): void {
    if (this.options.cropMode() === "arrange") {
      this.options.arrangeGestureController.pointerCancel(event);
      return;
    }

    this.releasePointer(event.pointerId);
    this.finishSelectionPointer(event.pointerId);
  }

  wheel(event: WheelEvent): void {
    if (!this.options.isSourceLoaded() || this.options.cropMode() !== "arrange") {
      return;
    }

    this.options.arrangeGestureController.wheel(event);
  }

  cancel(): void {
    this.options.arrangeGestureController.cancel();
    this.options.selectionCommandService.clearActivePointerState();
  }

  dispose(): void {
    this.cancel();
  }

  private finishSelectionPointer(pointerId: number): void {
    if (this.options.cropMode() === "polygon-lasso") {
      this.options.selectionCommandService.finishPolygonPointer(pointerId);
      return;
    }

    this.options.selectionCommandService.finishFreehandLasso(pointerId);
  }

  private captureIfAccepted(event: PointerEvent, accepted: boolean): void {
    if (!accepted) {
      return;
    }

    const surface = this.options.surface();

    if (!surface) {
      return;
    }

    capturePointer(surface, event.pointerId);
  }

  private releasePointer(pointerId: number): void {
    const surface = this.options.surface();

    if (!surface) {
      return;
    }

    releasePointer(surface, pointerId);
  }

  private isAllowedPointerStart(event: PointerEvent): boolean {
    return !(event.pointerType === "mouse" && event.button !== 0);
  }
}
