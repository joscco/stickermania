import {
  Component, input, computed, signal,
  ElementRef, AfterViewInit, OnDestroy, inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import {SvgComponent} from '../svg/svg.component';
import {AnimOnInitDirective, type AnimType} from '../animations/anim-on-init.directive';

// ── Banner layout ──────────────────────────────────────────
const BANNER_HEIGHT = 100;
const BORDER_TOP_BOTTOM = 16;
const BORDER_SIDE = 40;
const CONTENT_PAD_X = 20;
const CONTENT_PAD_Y = 8;

// ── Border-image (from SVG Schrift polygon) ────────────────
const BORDER_IMAGE_SLICE = '94 406 95 406 fill';

// ── Font measurement ───────────────────────────────────────
const FONT_FAMILY = "'Darumadrop One Fixed', 'Darumadrop One', cursive";
const BASE_FONT_PX = 16;
const LINE_HEIGHT = 1.15;
const FONT_LO = 0.25;

// ── Subtitle ───────────────────────────────────────────────
const SUBTITLE_FONT_MIN = 0.75;
const SUBTITLE_FONT_MAX = 1;
const SUBTITLE_WIDTH_FACTOR = 600;
const SUBTITLE_LINE_HEIGHT_FACTOR = 1.4;

// ── Main text ──────────────────────────────────────────────
const ICON_WIDTH = 52;
const LINE_HEIGHT_SINGLE = 1.2;
const LINE_HEIGHT_MULTI = 1.1;

// ── Helpers ────────────────────────────────────────────────

let _ctx: CanvasRenderingContext2D | null = null;
function getCtx(): CanvasRenderingContext2D {
  if (!_ctx) {
    _ctx = document.createElement('canvas').getContext('2d')!;
  }
  return _ctx;
}

function wrapLines(text: string, fontSizePx: number, maxWidth: number): number {
  const ctx = getCtx();
  ctx.font = `800 ${fontSizePx}px ${FONT_FAMILY}`;
  const words = text.split(/\s+/).filter(w => w.length > 0);
  let lines = 0;
  let current = '';
  for (const word of words) {
    const wordWidth = ctx.measureText(word).width;
    if (wordWidth > maxWidth) {
      if (current) { lines++; current = ''; }
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

// ── Component ──────────────────────────────────────────────

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
      border-image-slice: ${BORDER_IMAGE_SLICE};
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

  readonly contentWidth = computed(() => Math.max(0, this.effectiveWidth() - 2 * BORDER_SIDE));
  readonly contentHeight = computed(() => BANNER_HEIGHT - 2 * BORDER_TOP_BOTTOM - CONTENT_PAD_Y);

  readonly borderWidthPx = computed(() => `${BORDER_TOP_BOTTOM}px ${BORDER_SIDE}px`);

  readonly fontSize = computed(() => {
    const text = this.text();
    const w = this.contentWidth();
    const h = this.contentHeight();
    const hasIcon = !!this.icon();
    const hasSub = !!this.subtitle();

    const iconW = hasIcon ? ICON_WIDTH : 0;
    const availW = w - CONTENT_PAD_X - iconW;
    const subH = hasSub ? this.subtitleLineHeight() : 0;
    const availH = h - CONTENT_PAD_Y - subH;

    if (!text || availW <= 0 || availH <= 0) return '1rem';

    let lo = FONT_LO;
    let hi = (availH / LINE_HEIGHT) / BASE_FONT_PX;

    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const px = mid * BASE_FONT_PX;
      const lines = wrapLines(text, px, availW);
      const totalH = lines * px * LINE_HEIGHT;
      if (totalH > availH) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    {
      const px = lo * BASE_FONT_PX;
      const lines = wrapLines(text, px, availW);
      const totalH = lines * px * LINE_HEIGHT;
      if (totalH > availH && availH > 0) {
        lo = availH / (lines * BASE_FONT_PX * LINE_HEIGHT);
      }
    }

    return `${lo.toFixed(3)}rem`;
  });

  readonly subtitleFontSize = computed(() => {
    if (!this.subtitle()) return '0rem';
    const cw = this.contentWidth();
    const rem = Math.max(SUBTITLE_FONT_MIN, Math.min(SUBTITLE_FONT_MAX, cw / SUBTITLE_WIDTH_FACTOR));
    return `${rem.toFixed(4)}rem`;
  });

  readonly subtitleLineHeight = computed(() => {
    const subRem = parseFloat(this.subtitleFontSize()) || SUBTITLE_FONT_MIN;
    return Math.round(subRem * BASE_FONT_PX * SUBTITLE_LINE_HEIGHT_FACTOR);
  });

  readonly textLineHeight = computed(() => {
    const text = this.text();
    const px = parseFloat(this.fontSize()) * BASE_FONT_PX;
    const iconW = this.icon() ? ICON_WIDTH : 0;
    const availW = this.contentWidth() - CONTENT_PAD_X - iconW;
    const lines = wrapLines(text, px, availW);
    return lines > 1 ? LINE_HEIGHT_MULTI : LINE_HEIGHT_SINGLE;
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
