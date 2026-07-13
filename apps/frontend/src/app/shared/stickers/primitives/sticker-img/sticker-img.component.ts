import {Component, input, computed} from '@angular/core';
import {CachedSrcDirective} from '../../../../core/assets/cached-src.directive';
import {getSpriteId} from '../../model/sprite-url.util';

@Component({
    selector: 'app-sticker-img',
    standalone: true,
    imports: [CachedSrcDirective],
    templateUrl: 'sticker-img.component.html',
    host: {class: 'block leading-[0]',},
})
export class StickerImgComponent {
    readonly imageUrl = input.required<string>();
    readonly alt      = input<string>('');
    readonly loading = input<"eager" | "lazy">("lazy");

    readonly isSprite = computed(() => this.imageUrl().startsWith('sprite:#'));
    readonly isFilled = computed(() => getSpriteId(this.imageUrl()).includes('-filled'));

    getLocalHref(imageUrl: string): string {
        return `#${getSpriteId(imageUrl)}`;
    }
}
