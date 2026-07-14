import {Component, computed, effect, input, signal} from '@angular/core';
import {getSpriteViewBox, preloadSprite} from '../../stickers/model/sprite-url.util';

type SvgLength = number | string | undefined;

function parseSvgLength(v: string | number): SvgLength {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : undefined;
  }

  const trimmed = v.trim();
  if (!trimmed) {
    return undefined;
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : trimmed;
}

@Component({
  selector: 'app-svg',
  standalone: true,
  template: `
    <svg [attr.width]="svgWidth()"
         [attr.height]="svgHeight()"
         [attr.viewBox]="viewBox()"
         aria-hidden="true" focusable="false"
         style="display:block;"
         [style.color]="color()"
         [style.opacity]="opacity()">
      <use [attr.href]="href()"/>
    </svg>
  `,
  host: {
    style: 'display:inline-flex;align-items:center;justify-content:center;line-height:0;',
  },
})
export class SvgComponent {
  readonly name = input.required<string>();
  readonly w = input<SvgLength, string | number>(undefined, {transform: parseSvgLength});
  readonly h = input<SvgLength, string | number>(undefined, {transform: parseSvgLength});
  readonly color = input('currentColor');
  readonly opacity = input('1');

  readonly svgWidth = computed(() => this.w());
  readonly svgHeight = computed(() => this.h() ?? this.w());

  readonly href = computed(() => {
    const n = this.name();
    const id = n.startsWith('sprite:#') ? n.replace('sprite:#', '') : n;
    // Always use local fragment reference — the sprite is injected inline by preloadSprite()
    return `#${id}`;
  });

  readonly viewBox = signal<string|null>(null);

  constructor() {
    effect(() => {
      const svgName = this.name();
      const spriteId = svgName.startsWith('sprite:#') ? svgName.replace('sprite:#', '') : svgName;
      const spriteViewBox = getSpriteViewBox(`sprite:#${spriteId}`);
      if (spriteViewBox) {
        this.viewBox.set(`0 0 ${spriteViewBox.width} ${spriteViewBox.height}`);
      } else {
        preloadSprite().then(() => {
          const vb2 = getSpriteViewBox(`sprite:#${spriteId}`);
          if (vb2) this.viewBox.set(`0 0 ${vb2.width} ${vb2.height}`);
        });
      }
    });
  }
}
