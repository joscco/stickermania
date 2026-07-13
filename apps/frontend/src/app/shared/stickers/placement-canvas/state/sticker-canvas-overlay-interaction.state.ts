import {signal} from "@angular/core";
import {BoundingBox} from '../../model/types';

export class StickerCanvasOverlayInteractionState {
  readonly isRotating = signal(false);
  readonly accumulatedRotateDeg = signal(0);
  readonly freezeOverlay = signal(false);

  private frozenOverlayBox: BoundingBox | null = null;
  private lastRotatePoint: {x: number; y: number} | null = null;

  overlayBoxForSelection(selectionIds: string[], calculate: () => BoundingBox | null): BoundingBox | null {
    if (!selectionIds.length) {
      this.frozenOverlayBox = null;
      return null;
    }

    if (this.freezeOverlay()) {
      return this.frozenOverlayBox;
    }

    return calculate();
  }

  beginRotate(currentRotation: number, currentBox: BoundingBox | null): void {
    if (!this.freezeOverlay()) {
      this.frozenOverlayBox = currentBox;
      this.freezeOverlay.set(true);
    }

    if (!this.isRotating()) {
      this.accumulatedRotateDeg.set(currentRotation);
    }

    this.isRotating.set(true);
  }

  rotationDeltaForPointer(
    box: BoundingBox,
    canvasRect: DOMRect,
    clientX: number,
    clientY: number,
  ): number | null {
    const centerX = canvasRect.left + box.x + box.w / 2;
    const centerY = canvasRect.top + box.y + box.h / 2;

    if (!this.lastRotatePoint) {
      this.lastRotatePoint = {x: clientX, y: clientY};
      return null;
    }

    const previousAngle = Math.atan2(this.lastRotatePoint.y - centerY, this.lastRotatePoint.x - centerX);
    const currentAngle = Math.atan2(clientY - centerY, clientX - centerX);
    this.lastRotatePoint = {x: clientX, y: clientY};

    const deltaDeg = (currentAngle - previousAngle) * 180 / Math.PI;
    this.accumulatedRotateDeg.update(rotation => rotation + deltaDeg);
    return deltaDeg;
  }

  finishRotate(): void {
    this.isRotating.set(false);
    this.freezeOverlay.set(false);
    this.accumulatedRotateDeg.set(0);
    this.lastRotatePoint = null;
  }

  clear(): void {
    this.finishRotate();
    this.frozenOverlayBox = null;
  }
}
