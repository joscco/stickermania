import {Component, input, output, signal, effect, AfterViewChecked, ViewChild, ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../../svg/svg.component';
import type {BoundingBox} from '../types';

export type ActionBarAction =
  | 'delete' | 'flipH'
  | 'zForward' | 'zBackward' | 'zFront' | 'zBack'
  | 'group' | 'ungroup'
  | 'duplicate' | 'reset';

@Component({
  selector: 'app-sticker-action-bar',
  standalone: true,
  imports: [CommonModule, SvgComponent],
  templateUrl: './sticker-action-bar.component.html',
  host: {class: 'absolute z-[9500] transition-[left,top] duration-150 ease-out'},
})
export class StickerActionBarComponent implements AfterViewChecked {

  readonly visible = input<boolean>(false);
  readonly box = input<BoundingBox | null>(null);
  readonly centerX = input<number>(0);
  readonly centerY = input<number>(0);
  readonly canvasW = input<number>(400);
  readonly canvasH = input<number>(400);
  readonly isMulti = input<boolean>(false);
  readonly canGroup = input<boolean>(false);
  readonly canUngroup = input<boolean>(false);
  readonly canDuplicate = input<boolean>(true);
  readonly spacing = input<number>(8);
  readonly stickerRotation = input<number>(0);

  readonly action = output<ActionBarAction>();

  @ViewChild('bar') barRef?: ElementRef<HTMLDivElement>;

  readonly clampedX = signal(0);
  readonly clampedY = signal(0);

  private lastCenterX = -1;
  private lastCenterY = -1;
  private lastBoxY = -1;
  private lastRotation = 999;

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.lastCenterX = -1;
        this.lastCenterY = -1;
        this.lastBoxY = -1;
        this.lastRotation = 999;
      }
    });
  }

  ngAfterViewChecked(): void {
    if (!this.visible() || !this.box() || !this.barRef) return;
    const el = this.barRef.nativeElement as HTMLElement;
    const bw = el.offsetWidth || 200;
    const bh = el.offsetHeight || 44;
    const box = this.box()!;
    const pad = this.spacing();
    const cxIn = this.centerX();
    const cyIn = this.centerY();

    const sameCenter = Math.abs(cxIn - this.lastCenterX) < 1 && Math.abs(cyIn - this.lastCenterY) < 1;
    const sameBoxY = Math.abs(box.y - this.lastBoxY) < 1;
    const sameRotation = Math.abs(this.stickerRotation() - this.lastRotation) < 0.5;
    if (sameCenter && sameBoxY && sameRotation) return;
    this.lastCenterX = cxIn;
    this.lastCenterY = cyIn;
    this.lastBoxY = box.y;
    this.lastRotation = this.stickerRotation();

    let cx = cxIn - bw / 2;

    const maxY = this.canvasH() - bh - pad;
    const aboveY = box.y - bh - pad;
    const belowY = box.y + box.h + pad;

    let cy: number;
    if (aboveY >= pad && aboveY <= maxY) {
      cy = aboveY;
    } else if (belowY >= pad && belowY <= maxY) {
      cy = belowY;
    } else {
      cy = aboveY;
    }

    cx = Math.max(pad, Math.min(cx, this.canvasW() - bw - pad));
    cy = Math.max(pad, Math.min(cy, maxY));

    this.clampedX.set(cx);
    this.clampedY.set(cy);
  }

  onAction(a: ActionBarAction, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.action.emit(a);
  }
}
