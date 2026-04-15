import {Component, input} from '@angular/core';
import {getSpriteHref} from '../sprite-url.util';

@Component({
    selector: 'app-sticker-img',
    standalone: true,
    templateUrl: 'sticker-img.component.html',
    host: {class: 'block; leading-[0]',},
})
export class StickerImgComponent {
    readonly imageUrl = input.required<string>();
    readonly alt      = input<string>('');
    readonly getSpriteHref = getSpriteHref;
}

