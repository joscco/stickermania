import {Component, effect, input, output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {applyDirectManipulationStyles, capturePointer, releasePointer} from '../../../input/pointer-event-utils';
import {SvgComponent} from '../../../ui/svg/svg.component';
import {BoundingBox, Point} from '../../model/types';

export interface OverlayHandleEvent {
  type: 'rotate' | 'scale' | 'n' | 's' | 'e' | 'w';
  dx: number;
  dy: number;
  clientX: number;
  clientY: number;
  done: boolean;
}

@Component({
  selector: 'app-sticker-overlay',
  standalone: true,
  imports: [CommonModule, SvgComponent],
  templateUrl: './sticker-overlay.component.html',
  host: {class: 'absolute inset-0 z-[9000] block pointer-events-none touch-none select-none'},
})
export class StickerOverlayComponent {

  readonly visible = input(false);
  readonly box = input<BoundingBox | null>(null);
  readonly rotationOrigin = input<Point | null>(null);
  readonly rotation = input(0);
  readonly showHandles = input(true);
  readonly dimmed = input(false);

  readonly handleDrag = output<OverlayHandleEvent>();

  readonly activeHandle = signal<string | null>(null);
  readonly renderVisible = signal(false);
  readonly overlayActive = signal(false);
  readonly displayBox = signal<BoundingBox | null>(null);
  readonly displayRotationOrigin = signal<Point | null>(null);
  readonly displayRotation = signal(0);

  readonly stickerOutlineColor = '#ffb700';
  readonly stickerOutlineWidth = 5;

  private startClientX = 0;
  private startClientY = 0;
  private activeHandlePointerId: number | null = null;
  private cleanupActiveHandleDrag: (() => void) | null = null;

  public constructor() {
    effect(() => {
      const box = this.box();

      if (this.visible() && box) {
        this.displayBox.set(box);
        this.displayRotationOrigin.set(this.rotationOrigin());
        this.displayRotation.set(this.rotation());
        this.renderVisible.set(true);

        requestAnimationFrame(() => {
          if (this.visible() && this.box()) {
            this.overlayActive.set(true);
          }
        });

        return;
      }

      this.overlayActive.set(false);
      this.renderVisible.set(false);
      this.displayBox.set(null);
      this.displayRotationOrigin.set(null);
    });
  }

  onHandleDown(event: PointerEvent, handle: OverlayHandleEvent['type']): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.activeHandlePointerId !== null) {
      return;
    }

    const handleElement = event.currentTarget as HTMLElement | null;

    if (!handleElement) {
      return;
    }

    applyDirectManipulationStyles(handleElement);
    capturePointer(handleElement, event.pointerId);

    this.startClientX = event.clientX;
    this.startClientY = event.clientY;
    this.activeHandlePointerId = event.pointerId;
    this.activeHandle.set(handle);

    const handledMoveEvents = new WeakSet<PointerEvent>();

    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== this.activeHandlePointerId) {
        return;
      }

      if (handledMoveEvents.has(moveEvent)) {
        return;
      }

      handledMoveEvents.add(moveEvent);

      moveEvent.preventDefault();
      moveEvent.stopPropagation();

      const deltaX = moveEvent.clientX - this.startClientX;
      const deltaY = moveEvent.clientY - this.startClientY;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      this.handleDrag.emit({
        type: handle,
        dx: deltaX,
        dy: deltaY,
        clientX: moveEvent.clientX,
        clientY: moveEvent.clientY,
        done: false,
      });

      this.startClientX = moveEvent.clientX;
      this.startClientY = moveEvent.clientY;
    };

    const onUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId !== this.activeHandlePointerId) {
        return;
      }

      upEvent.preventDefault();
      upEvent.stopPropagation();

      releasePointer(handleElement, upEvent.pointerId);
      this.finishHandleDrag(handle);
    };

    const onLostPointerCapture = (lostCaptureEvent: PointerEvent): void => {
      if (lostCaptureEvent.pointerId !== this.activeHandlePointerId) {
        return;
      }

      this.finishHandleDrag(handle);
    };

    handleElement.addEventListener('pointermove', onMove, {passive: false});
    handleElement.addEventListener('pointerup', onUp, {passive: false});
    handleElement.addEventListener('pointercancel', onUp, {passive: false});
    handleElement.addEventListener('lostpointercapture', onLostPointerCapture, {passive: false});

    window.addEventListener('pointermove', onMove, {capture: true, passive: false});
    window.addEventListener('pointerup', onUp, {capture: true, passive: false});
    window.addEventListener('pointercancel', onUp, {capture: true, passive: false});

    this.cleanupActiveHandleDrag = () => {
      handleElement.removeEventListener('pointermove', onMove);
      handleElement.removeEventListener('pointerup', onUp);
      handleElement.removeEventListener('pointercancel', onUp);
      handleElement.removeEventListener('lostpointercapture', onLostPointerCapture);

      window.removeEventListener('pointermove', onMove, {capture: true});
      window.removeEventListener('pointerup', onUp, {capture: true});
      window.removeEventListener('pointercancel', onUp, {capture: true});
    };
  }

  transformOrigin(box: BoundingBox): string {
    const origin = this.displayRotationOrigin();

    return origin
      ? `${origin.x}px ${origin.y}px`
      : `${box.w / 2}px ${box.h / 2}px`;
  }

  private finishHandleDrag(handle: OverlayHandleEvent['type']): void {
    this.cleanupActiveHandleDrag?.();
    this.cleanupActiveHandleDrag = null;

    this.activeHandlePointerId = null;
    this.activeHandle.set(null);

    this.handleDrag.emit({
      type: handle,
      dx: 0,
      dy: 0,
      clientX: this.startClientX,
      clientY: this.startClientY,
      done: true,
    });
  }
}
