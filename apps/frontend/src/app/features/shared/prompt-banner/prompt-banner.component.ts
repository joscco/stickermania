import {
  Component, input, computed, signal,
  ElementRef, AfterViewInit, OnDestroy, inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../svg/svg.component';
import {AnimOnInitDirective, type AnimType} from '../animations/anim-on-init.directive';

const BANNER_HEIGHT = 100;
const TOP_BOTTOM_BORDER = 16;
const SIDE_BORDER = 40;
const CONTENT_PAD_Y = 8;
const LINE_HEIGHT = 1.15;

let _ctx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D {
  if (!_ctx) {
    _ctx = document.createElement('canvas').getContext('2d')!;
  }
  return _ctx;
}

const FONT_FAMILY = "'Darumadrop One Fixed', 'Darumadrop One', cursive";

function wrapLines(text: string, fontSize: number, maxWidth: number): number {
  const ctx = getCtx();
  ctx.font = `800 ${fontSize}px ${FONT_FAMILY}`;
  const words = text.split(/\s+/).filter(w => w.length > 0);
  let lines = 0;
  let current = '';
  for (const word of words) {
    const wordWidth = ctx.measureText(word).width;
    if (wordWidth > maxWidth) {
      if (current) {
        lines++;
        current = '';
      }
      lines += Math.max(1, Math.ceil(wordWidth / maxWidth));
      continue;
    }
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth) {
      lines++;
      current = word;
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
  styles: [`
    .banner-bg {
      border-style: solid;
      border-image-source: url(/assets/svg/prompt-background.svg);
      border-image-slice: 125 450 125 450 fill;
      border-image-repeat: stretch;
      border-image-width: 1;
    }
  `],
})
export class PromptBannerComponent implements AfterViewInit, OnDestroy {

  readonly text = input.required<string>();
  readonly widthPx = input<number | undefined>(undefined);
  readonly maxWidthPx = input<number>(540);
  readonly subtitle = input<string>('');
  readonly icon = input<string>('');
  readonly anim = input<AnimType>('banner');

  private readonly el = inject(ElementRef);
  private readonly measuredWidth = signal(400);
  private resizeObserver?: ResizeObserver;

  private readonly uncappedWidth = computed(() => this.widthPx() ?? this.measuredWidth());

  readonly effectiveWidth = computed(() => Math.min(this.uncappedWidth(), this.maxWidthPx()));

  readonly contentWidth = computed(() => Math.max(0, this.effectiveWidth() - 2 * SIDE_BORDER));
  readonly contentHeight = computed(() => BANNER_HEIGHT - 2 * TOP_BOTTOM_BORDER - CONTENT_PAD_Y);

  readonly borderWidthPx = computed(() => `${TOP_BOTTOM_BORDER}px ${SIDE_BORDER}px`);

  readonly fontSize = computed(() => {
    const text = this.text();
    const w = this.contentWidth();
    const h = this.contentHeight();
    const hasIcon = !!this.icon();
    const hasSub = !!this.subtitle();

    const innerPadW = 20;
    const innerPadH = 10;
    const iconW = hasIcon ? 52 : 0;
    const availW = w - innerPadW - iconW;
    const subH = hasSub ? this.subtitleLineHeight() : 0;
    const availH = h - innerPadH - subH;

    if (!text || availW <= 0 || availH <= 0) return '1rem';

    // Binary search: find largest font size where text fits both width and height.
    // lo = minimum readable  |  hi = theoretical max (single line filling entire height)
    let lo = 0.25;
    let hi = (availH / LINE_HEIGHT) / 16;

    for (let i = 0; i < 16; i++) {
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

    // Final exact fit: scale lo so the measured text height precisely fills availH
    {
      const px = lo * 16;
      const lines = wrapLines(text, px, availW);
      const totalH = lines * px * LINE_HEIGHT;
      if (totalH > availH && availH > 0) {
        lo = availH / (lines * 16 * LINE_HEIGHT);
      }
    }

    return `${lo.toFixed(3)}rem`;
  });

  readonly subtitleFontSize = computed(() => {
    if (!this.subtitle()) return '0rem';
    const cw = this.contentWidth();
    const rem = Math.max(0.4, Math.min(0.75, cw / 600));
    return `${rem.toFixed(4)}rem`;
  });

  readonly subtitleLineHeight = computed(() => {
    const subRem = parseFloat(this.subtitleFontSize()) || 0.5;
    return Math.round(subRem * 16 * 1.4);
  });

  readonly textLineHeight = computed(() => {
    const text = this.text();
    const px = parseFloat(this.fontSize()) * 16;
    const iconW = this.icon() ? 52 : 0;
    const availW = this.contentWidth() - 20 - iconW;
    const lines = wrapLines(text, px, availW);
    return lines > 1 ? 1.1 : 1.2;
  });

  readonly effectiveMaxWidthPx = computed(() => {
    const mw = this.maxWidthPx();
    const wp = this.widthPx();
    if (wp !== undefined) return Math.min(wp, mw);
    return mw;
  });

  readonly cappedMaxWidth = computed(() => {
    const v = this.effectiveMaxWidthPx();
    return isFinite(v) ? v : null;
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

  protected readonly BANNER_HEIGHT = BANNER_HEIGHT;
}
