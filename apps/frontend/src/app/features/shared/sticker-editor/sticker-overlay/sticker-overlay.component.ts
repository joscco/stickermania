import {Component, input, output, signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../../svg/svg.component';
import type {BoundingBox} from '../types';

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
  host: {class: 'absolute z-[9000]'},
})
export class StickerOverlayComponent {

  readonly visible = input(false);
  readonly box = input<BoundingBox | null>(null);
  readonly rotation = input(0);

  readonly handleDrag = output<OverlayHandleEvent>();

  readonly activeHandle = signal<string | null>(null);
  private startX = 0; private startY = 0;

  onHandleDown(ev: PointerEvent, handle: string): void {
    ev.preventDefault();
    ev.stopPropagation();
    (ev.target as HTMLElement)?.setPointerCapture?.(ev.pointerId);
    this.startX = ev.clientX;
    this.startY = ev.clientY;
    this.activeHandle.set(handle);

    const onMove = (me: PointerEvent) => {
      me.preventDefault();
      this.handleDrag.emit({
        type: handle as OverlayHandleEvent['type'],
        dx: me.clientX - this.startX,
        dy: me.clientY - this.startY,
        clientX: me.clientX,
        clientY: me.clientY,
        done: false,
      });
      this.startX = me.clientX;
      this.startY = me.clientY;
    };

    const onUp = () => {
      this.activeHandle.set(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.handleDrag.emit({type: handle as OverlayHandleEvent['type'], dx: 0, dy: 0, clientX: 0, clientY: 0, done: true});
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
}
