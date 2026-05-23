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
    const barW = el.offsetWidth || 200;
    const barH = el.offsetHeight || 44;
    const box = this.box()!;
    const cxIn = this.centerX();
    const cyIn = this.centerY();

    // ── Skip if nothing changed ──
    if (Math.abs(cxIn - this.lastCenterX) < 1
      && Math.abs(cyIn - this.lastCenterY) < 1
      && Math.abs(box.y - this.lastBoxY) < 1
      && Math.abs(this.stickerRotation() - this.lastRotation) < 0.5) return;
    this.lastCenterX = cxIn; this.lastCenterY = cyIn;
    this.lastBoxY = box.y; this.lastRotation = this.stickerRotation();

    // ── Parameters ──
    const edgePad = 4;                                        // min distance to canvas edge
    const rad = this.stickerRotation() * Math.PI / 180;
    const hw = box.w / 2, hh = box.h / 2;
    const s = Math.sin(rad), c = Math.cos(rad);
    const corners = [
      -hh * c - hw * s, -hh * c + hw * s,
       hh * c - hw * s,  hh * c + hw * s,
    ];
    const topmost = Math.min(...corners);
    const extraGap = Math.max(0, -hh - topmost);
    const gap = this.spacing() + extraGap;

    // ── Position ──
    let cx = cxIn - barW / 2;
    let cy = box.y - barH - gap;                              // prefer above box
    if (cy < edgePad) {
      cy = box.y + box.h + gap               // fallback: below box
    }

    cx = Math.max(edgePad, Math.min(cx, this.canvasW() - barW - edgePad));
    cy = Math.max(edgePad, Math.min(cy, this.canvasH() - barH - edgePad));

    this.clampedX.set(cx);
    this.clampedY.set(cy);
  }

  onAction(a: ActionBarAction, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.action.emit(a);
  }
}
