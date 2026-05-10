import {
  Component, input, computed, signal,
  ElementRef, AfterViewInit, OnDestroy, inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../svg/svg.component';
import {AnimOnInitDirective, type AnimType} from '../animations/anim-on-init.directive';

const SVG_ASPECT = 3681.882 / 830.175;
const TEXT_W_RATIO = 0.75;
const TEXT_H_RATIO = 0.5;
const LINE_HEIGHT = 1.25;

let _ctx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D {
  if (!_ctx) {
    _ctx = document.createElement('canvas').getContext('2d')!;
  }
  return _ctx;
}

function wrapLines(text: string, fontSize: number, maxWidth: number): number {
  const ctx = getCtx();
  ctx.font = `800 ${fontSize}px sans-serif`;
  const words = text.split(/\s+/).filter(w => w.length > 0);
  let lines = 0;
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) {
        lines++;
        current = word;
      } else {
        lines++;
        current = '';
      }
    } else {
      current = test;
    }
  }
  if (current) lines++;
  return Math.max(1, lines);
}

@Component({
  selector: 'app-prompt-banner',
  standalone: true,
  imports: [CommonModule, SvgComponent, AnimOnInitDirective],
  templateUrl: './prompt-banner.component.html',
  host: {class: 'block'},
})
export class PromptBannerComponent implements AfterViewInit, OnDestroy {

  readonly text = input.required<string>();
  readonly widthPx = input<number | undefined>(undefined);
  readonly maxWidthPx = input<number>(512);
  readonly subtitle = input<string>('');
  readonly icon = input<string>('');
  readonly anim = input<AnimType>('banner');

  private readonly el = inject(ElementRef);
  private readonly measuredWidth = signal(400);
  private resizeObserver?: ResizeObserver;

  private readonly uncappedWidth = computed(() => this.widthPx() ?? this.measuredWidth());

  readonly effectiveWidth = computed(() => Math.min(this.uncappedWidth(), this.maxWidthPx()));

  readonly textAreaW = computed(() => Math.round(this.effectiveWidth() * TEXT_W_RATIO));
  readonly textAreaH = computed(() => Math.round((this.effectiveWidth() / SVG_ASPECT) * TEXT_H_RATIO));

  readonly fontSize = computed(() => {
    const text = this.text();
    const w = this.textAreaW();
    const h = this.textAreaH();
    const hasIcon = !!this.icon();
    const hasSub = !!this.subtitle();

    const iconW = hasIcon ? 52 : 0;
    const availW = w - iconW;
    const subH = hasSub ? 20 : 0;
    const availH = h - subH;

    if (!text) return '1rem';

    let lo = 0.55;
    let hi = 2.5;

    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const px = mid * 16;
      const lines = wrapLines(text, px, availW);
      const totalH = lines * px * LINE_HEIGHT;
      if (totalH > availH) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    return `${lo.toFixed(3)}rem`;
  });

  readonly effectiveMaxWidthPx = computed(() => {
    const mw = this.maxWidthPx();
    const wp = this.widthPx();
    if (wp !== undefined) return Math.min(wp, mw);
    return mw;
  });

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        this.measuredWidth.set(entry.contentRect.width);
      }
    });
    this.resizeObserver.observe(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected readonly SVG_ASPECT = SVG_ASPECT;
  protected readonly TEXT_W_RATIO = TEXT_W_RATIO;
  protected readonly TEXT_H_RATIO = TEXT_H_RATIO;
}
