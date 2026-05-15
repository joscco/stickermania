import {Component, input, computed} from '@angular/core';
import {getSpriteId} from '../sprite-url.util';

@Component({
    selector: 'app-sticker-img',
    standalone: true,
    templateUrl: 'sticker-img.component.html',
    host: {class: 'block; leading-[0]',},
})
export class StickerImgComponent {
    readonly imageUrl = input.required<string>();
    readonly alt      = input<string>('');

    readonly isFilled = computed(() => getSpriteId(this.imageUrl()).includes('-filled'));

    getLocalHref(imageUrl: string): string {
        return `#${getSpriteId(imageUrl)}`;
    }
}