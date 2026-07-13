import {Component, input, output, signal, effect, computed, AfterViewChecked, ViewChild, ElementRef} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../../../ui/svg/svg.component';
import {BoundingBox} from '../../model/types';

export type ActionBarAction =
  | 'delete' | 'flipH'
  | 'zForward' | 'zBackward' | 'zFront' | 'zBack'
  | 'duplicate' | 'reset' | 'lock' | 'unlock' | 'close';

export type ActionBarViewportBounds = {minX: number; minY: number; maxX: number; maxY: number};
type ActionBarSize = {width: number; height: number};
type ActionBarPosition = {x: number; y: number};
type ActionBarSafeBounds = {minX: number; minY: number; maxX: number; maxY: number};
type ActionBarLayoutSnapshot = {
  centerX: number;
  centerY: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  rotation: number;
  boundsMinX: number;
  boundsMinY: number;
  boundsMaxX: number;
  boundsMaxY: number;
  barW: number;
  barH: number;
};

@Component({
  selector: 'app-sticker-action-bar',
  standalone: true,
  imports: [CommonModule, SvgComponent],
  templateUrl: './sticker-action-bar.component.html',
  host: {class: 'absolute z-[9500]'},
})
export class StickerActionBarComponent implements AfterViewChecked {

  readonly visible = input<boolean>(false);
  readonly box = input<BoundingBox | null>(null);
  readonly centerX = input<number>(0);
  readonly centerY = input<number>(0);
  readonly canvasW = input<number>(400);
  readonly canvasH = input<number>(400);
  readonly viewportBounds = input<ActionBarViewportBounds | null>(null);
  readonly spacing = input<number>(8);
  readonly stickerRotation = input<number>(0);
  readonly mode = input<'edit' | 'locked'>('edit');

  readonly action = output<ActionBarAction>();

  @ViewChild('bar') barRef?: ElementRef<HTMLDivElement>;

  readonly clampedX = signal(0);
  readonly clampedY = signal(0);
  readonly renderVisible = signal(false);
  readonly actionBarActive = signal(false);
  readonly displayBox = signal<BoundingBox | null>(null);
  readonly displayCenterX = signal(0);
  readonly displayCenterY = signal(0);
  readonly displayRotation = signal(0);

  readonly barWidth = computed(() => this.mode() === 'locked' ? 45 : 300);

  private lastLayout: ActionBarLayoutSnapshot | null = null;
  private readonly sideViewportOffset = 8;
  private readonly topViewportOffset = 72;
  private readonly bottomViewportOffset = 165;

  constructor() {
    effect(() => {
      this.lastLayout = null;
    });

    effect(() => {
      const box = this.box();
      if (this.visible() && box) {
        this.displayBox.set(box);
        this.displayCenterX.set(this.centerX());
        this.displayCenterY.set(this.centerY());
        this.displayRotation.set(this.stickerRotation());
        this.renderVisible.set(true);
        this.lastLayout = null;
        requestAnimationFrame(() => {
          if (this.visible() && this.box()) {
            this.actionBarActive.set(true);
          }
        });
        return;
      }

      this.actionBarActive.set(false);
      this.renderVisible.set(false);
      this.displayBox.set(null);
    });
  }

  ngAfterViewChecked(): void {
    const box = this.displayBox();
    if (!this.renderVisible() || !box || !this.barRef) {
      return;
    }

    const centerX = this.displayCenterX();
    const centerY = this.displayCenterY();
    const rotation = this.displayRotation();
    const bounds = this.effectiveViewportBounds();
    const barSize = this.measureActionBar(this.barRef.nativeElement);
    const snapshot = this.layoutSnapshot(box, centerX, centerY, rotation, bounds, barSize);

    if (!this.layoutChanged(snapshot)) {
      return;
    }

    this.lastLayout = snapshot;

    const position = this.calculateActionBarPosition(box, centerX, rotation, bounds, barSize);
    this.clampedX.set(position.x);
    this.clampedY.set(position.y);
  }

  private effectiveViewportBounds(): ActionBarViewportBounds {
    return this.viewportBounds() ?? {minX: 0, minY: 0, maxX: this.canvasW(), maxY: this.canvasH()};
  }

  private measureActionBar(el: HTMLElement): ActionBarSize {
    return {
      width: this.barWidth(),
      height: el.offsetHeight || 44,
    };
  }

  private calculateActionBarPosition(
    box: BoundingBox,
    centerX: number,
    rotation: number,
    bounds: ActionBarViewportBounds,
    barSize: ActionBarSize,
  ): ActionBarPosition {
    const safeBounds = this.actionBarSafeBounds(bounds, barSize);
    const gap = this.verticalGapForRotatedSticker(box, rotation);
    const preferredAboveY = box.y - barSize.height - gap;
    const fallbackBelowY = box.y + box.h + gap;
    const unclampedY = preferredAboveY < safeBounds.minY ? fallbackBelowY : preferredAboveY;

    return {
      x: this.clamp(centerX - barSize.width / 2, safeBounds.minX, safeBounds.maxX),
      y: this.clamp(unclampedY, safeBounds.minY, safeBounds.maxY),
    };
  }

  private actionBarSafeBounds(bounds: ActionBarViewportBounds, barSize: ActionBarSize): ActionBarSafeBounds {
    return {
      minX: bounds.minX + this.sideViewportOffset,
      minY: bounds.minY + this.topViewportOffset,
      maxX: bounds.maxX - barSize.width - this.sideViewportOffset,
      maxY: bounds.maxY - barSize.height - this.bottomViewportOffset,
    };
  }

  private verticalGapForRotatedSticker(box: BoundingBox, rotation: number): number {
    const radians = rotation * Math.PI / 180;
    const halfWidth = box.w / 2;
    const halfHeight = box.h / 2;
    const sin = Math.sin(radians);
    const cos = Math.cos(radians);

    const rotatedCornerOffsetsY = [
      -halfHeight * cos - halfWidth * sin,
      -halfHeight * cos + halfWidth * sin,
      halfHeight * cos - halfWidth * sin,
      halfHeight * cos + halfWidth * sin,
    ];

    const topmostOffsetY = Math.min(...rotatedCornerOffsetsY);
    const extraGap = Math.max(0, -halfHeight - topmostOffsetY);

    return this.spacing() + extraGap;
  }

  private layoutSnapshot(
    box: BoundingBox,
    centerX: number,
    centerY: number,
    rotation: number,
    bounds: ActionBarViewportBounds,
    barSize: ActionBarSize,
  ): ActionBarLayoutSnapshot {
    return {
      centerX,
      centerY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.w,
      boxH: box.h,
      rotation,
      boundsMinX: bounds.minX,
      boundsMinY: bounds.minY,
      boundsMaxX: bounds.maxX,
      boundsMaxY: bounds.maxY,
      barW: barSize.width,
      barH: barSize.height,
    };
  }

  private layoutChanged(next: ActionBarLayoutSnapshot): boolean {
    const prev = this.lastLayout;

    if (!prev) {
      return true;
    }

    return Math.abs(next.centerX - prev.centerX) >= 1
      || Math.abs(next.centerY - prev.centerY) >= 1
      || Math.abs(next.boxX - prev.boxX) >= 1
      || Math.abs(next.boxY - prev.boxY) >= 1
      || Math.abs(next.boxW - prev.boxW) >= 1
      || Math.abs(next.boxH - prev.boxH) >= 1
      || Math.abs(next.rotation - prev.rotation) >= 0.5
      || Math.abs(next.boundsMinX - prev.boundsMinX) >= 1
      || Math.abs(next.boundsMinY - prev.boundsMinY) >= 1
      || Math.abs(next.boundsMaxX - prev.boundsMaxX) >= 1
      || Math.abs(next.boundsMaxY - prev.boundsMaxY) >= 1
      || Math.abs(next.barW - prev.barW) >= 1
      || Math.abs(next.barH - prev.barH) >= 1;
  }

  private clamp(value: number, min: number, max: number): number {
    if (max < min) {
      return min;
    }

    return Math.max(min, Math.min(value, max));
  }

  onAction(action: ActionBarAction, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.action.emit(action);
  }

}
