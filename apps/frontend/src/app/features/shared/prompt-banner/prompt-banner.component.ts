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
const LINE_HEIGHT = 1.25;

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
      border-image-slice: 94 406 94 406 fill;
      border-image-repeat: stretch;
      border-image-width: 1;
    }
  `],
})
export class PromptBannerComponent implements AfterViewInit, OnDestroy {

  readonly text = input.required<string>();
  readonly widthPx = input<number | undefined>(undefined);
  readonly maxWidthPx = input<number>(640);
  readonly subtitle = input<string>('');
  readonly icon = input<string>('');
  readonly anim = input<AnimType>('banner');

  private readonly el = inject(ElementRef);
  private readonly measuredWidth = signal(400);
  private resizeObserver?: ResizeObserver;

  private readonly uncappedWidth = computed(() => this.widthPx() ?? this.measuredWidth());

  readonly effectiveWidth = computed(() => Math.min(this.uncappedWidth(), this.maxWidthPx()));

  readonly contentWidth = computed(() => Math.max(0, this.effectiveWidth() - 2 * SIDE_BORDER));
  readonly contentHeight = computed(() => BANNER_HEIGHT - 2 * TOP_BOTTOM_BORDER);

  readonly borderWidthPx = computed(() => `${TOP_BOTTOM_BORDER}px ${SIDE_BORDER}px`);

  readonly fontSize = computed(() => {
    const text = this.text();
    const w = this.contentWidth();
    const h = this.contentHeight();
    const hasIcon = !!this.icon();
    const hasSub = !!this.subtitle();

    const iconW = hasIcon ? 52 : 0;
    const availW = w - iconW;
    const subH = hasSub ? this.subtitleLineHeight() : 0;
    const availH = h - subH;

    if (!text) return '1rem';

    let lo = 0.3;
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

    {
      const px = lo * 16;
      const lines = wrapLines(text, px, availW);
      const totalH = lines * px * LINE_HEIGHT;
      if (totalH > availH && availH > 0) {
        lo = (availH / (lines * 16 * LINE_HEIGHT));
      }
    }

    return `${lo.toFixed(3)}rem`;
  });

  readonly subtitleFontSize = computed(() => {
    const cw = this.contentWidth();
    const rem = Math.max(0.5, Math.min(0.75, cw / 500));
    return `${rem.toFixed(4)}rem`;
  });

  readonly subtitleLineHeight = computed(() => {
    const cw = this.contentWidth();
    return Math.round(Math.max(12, cw * 0.035));
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
