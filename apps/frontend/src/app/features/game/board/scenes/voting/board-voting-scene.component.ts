import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageClientAction, StickerCollageModeState, StickerCollage, SessionPlayer} from "@birthday/shared";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-board-voting-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective],
    templateUrl: "./board-voting-scene.component.html",
    styleUrl: "./board-voting-scene.component.css",
})
export class BoardVotingSceneComponent {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly modeState = input<StickerCollageModeState | null>(null);


    public readonly submissions = computed<StickerCollage[]>(() => {
        const ms = this.modeState();
        if (!ms) return [];
        return ms.submissions[ms.currentRoundIndex] ?? [];
    });

    /** Double the submissions for seamless infinite scroll */
    public readonly doubledSubmissions = computed(() => {
        const subs = this.submissions();
        if (subs.length === 0) return [];
        return [...subs, ...subs];
    });

    public readonly scrollDuration = computed(() => {
        const count = this.submissions().length;
        return `${Math.max(8, count * 4)}s`;
    });

    public getPlayer(playerId: string): SessionPlayer | undefined {
        return this.worldStore.players()[playerId];
    }

    public endVotingEarly(): void {
        const action: StickerCollageClientAction = {type: "end-voting-early"};
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}
