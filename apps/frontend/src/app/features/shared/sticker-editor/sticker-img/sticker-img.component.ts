import {Component, input} from '@angular/core';
import {getSpriteHref} from '../sprite-url.util';

/**
 * Renders a sticker image as an inline SVG <use> referencing the sprite.
 *
 * Usage:
 *   <app-sticker-img [imageUrl]="sticker.imageUrl" [alt]="sticker.id" class="w-10 h-10"/>
 *
 * The host element should have a fixed size (w-* h-*) set via class.
 */
@Component({
    selector: 'app-sticker-img',
    standalone: true,
    template: `
        <svg
            [attr.aria-label]="alt()"
            aria-hidden="true"
            focusable="false"
            style="display:block;width:100%;height:100%;"
        >
            <use [attr.href]="getSpriteHref(imageUrl())"/>
        </svg>
    `,
    host: {
        style: 'display:block;line-height:0;',
    },
})
export class StickerImgComponent {
    readonly imageUrl = input.required<string>();
    readonly alt      = input<string>('');

    readonly getSpriteHref = getSpriteHref;
}

