import {Component, computed, input} from '@angular/core';

/**
 * Design-tier for icons.
 *
 * The tier controls which SVG symbol variant is loaded from the sprite,
 * because icons at different sizes need different levels of detail:
 *
 *  - **sm**  (≤ 16 px) — thick strokes, minimal detail  → `#icon-{name}-sm`
 *  - **md**  (20–36 px) — balanced detail                → `#icon-{name}-md`
 *  - **lg**  (40–64 px) — full detail, thin strokes      → `#icon-{name}-lg`
 *
 * The graphic designer receives the tier suffix as part of the SVG filename
 * (e.g. `icon-star-sm.svg`, `icon-star-lg.svg`) so they know exactly which
 * level of detail to target.
 *
 * If only one variant exists in the sprite the component falls back:
 *   lg → md → sm → bare name (no suffix).
 * This fallback is purely convention — the sprite build script does NOT
 * generate variants automatically; each variant is a separate source SVG.
 */
export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

/** Maps design-tier to a fixed pixel dimension. */
const SIZE_PX: Record<IconSize, number> = {
    sm: 20,
    md: 40,
    lg: 70,
    xl: 120,
};

const SPRITE = 'assets/sprite.svg';

/**
 * Renders an icon from the SVG sprite at a predefined design-tier size.
 *
 * Usage:
 *   <app-icon name="star" size="sm"/>          → 16 × 16,  loads #icon-star-sm
 *   <app-icon name="star" size="md"/>          → 24 × 24,  loads #icon-star-md
 *   <app-icon name="star" size="lg"/>          → 40 × 40,  loads #icon-star-lg
 *   <app-icon name="star"/>                    → 24 × 24   (default md)
 *
 * The host element is sized automatically — no extra w-* / h-* classes needed.
 * Tailwind color utilities (text-red-500 etc.) work via currentColor.
 */
@Component({
    selector: 'app-icon',
    standalone: true,
    template: `
        <svg [attr.width]="px()" [attr.height]="px()"
             aria-hidden="true" focusable="false"
             style="display:block;fill:currentColor;">
            <use [attr.href]="href()"/>
        </svg>
    `,
    host: {
        style: 'display:inline-flex;align-items:center;justify-content:center;line-height:0;',
        '[style.width.px]': 'px()',
        '[style.height.px]': 'px()',
    },
})
export class IconComponent {
    /** Icon name without the `icon-` prefix and without the size suffix.  E.g. `"star"`. */
    readonly name = input.required<string>();

    /** Design tier — controls which sprite symbol variant is loaded **and** the rendered size. */
    readonly size = input<IconSize>('md');

    /** Resolved pixel size. */
    readonly px = computed(() => SIZE_PX[this.size()]);

    /** Full sprite href including the size-tier suffix. */
    readonly href = computed(() => `${SPRITE}#icon-${this.name()}-${this.size()}`);
}

