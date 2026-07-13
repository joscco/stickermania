import {computed, inject, Injectable} from '@angular/core';
import {WorldStore} from '../../core/state/world.store';

@Injectable()
export class BoardScreenDataService {
    private readonly worldStore = inject(WorldStore);

    readonly gameState = computed(() => this.worldStore.stickerCollageGameState());
    readonly players = computed(() => this.worldStore.players());
    readonly stickersById = computed(() => {
        const result: Record<string, import("@birthday/shared").PlayerSticker> = {};
        const stickersByPlayer = this.gameState()?.playerStickers ?? {};
        for (const sticker of Object.values(stickersByPlayer).flat()) {
            result[sticker.id] = sticker;
        }
        return result;
    });
}
