import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageClientAction, StickerCollageModeState, SessionPlayer, StickerPack} from "@birthday/shared";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-board-building-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective],
    templateUrl: "./board-building-scene.component.html",
})
export class BoardBuildingSceneComponent {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly modeState = input<StickerCollageModeState | null>(null);


    public readonly connectedPlayers = computed<SessionPlayer[]>(() => {
        return Object.values(this.worldStore.players()).filter(p => p.connected);
    });

    public readonly lastUnlockedPack = computed<StickerPack | null>(() => {
        const ms = this.modeState();
        if (!ms?.lastUnlockedPackId) return null;
        return ms.stickerPacks.find(p => p.id === ms.lastUnlockedPackId) ?? null;
    });

    public readonly guaranteedPack = computed<StickerPack | null>(() => {
        const ms = this.modeState();
        if (!ms?.guaranteedPackId) return null;
        return ms.stickerPacks.find(p => p.id === ms.guaranteedPackId) ?? null;
    });

    public readonly submissionCount = computed(() => {
        const ms = this.modeState();
        if (!ms) return 0;
        return (ms.submissions[ms.currentRoundIndex] ?? []).length;
    });

    public isDrawing(playerId: string): boolean {
        const ms = this.modeState();
        if (!ms) return false;
        return !!ms.playerHands[playerId] && !this.hasSubmitted(playerId);
    }

    public hasSubmitted(playerId: string): boolean {
        const ms = this.modeState();
        if (!ms) return false;
        const subs = ms.submissions[ms.currentRoundIndex] ?? [];
        return subs.some(s => s.playerId === playerId);
    }

    public endRoundEarly(): void {
        const action: StickerCollageClientAction = {type: "end-round-early"};
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}
