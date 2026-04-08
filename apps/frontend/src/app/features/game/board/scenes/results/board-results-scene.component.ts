import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {
    StickerCollageClientAction,
    StickerCollageModeState,
    StickerCollageVoteResult,
    SessionPlayer,
} from "@birthday/shared";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-board-results-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective],
    templateUrl: "./board-results-scene.component.html",
})
export class BoardResultsSceneComponent {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly modeState = input<StickerCollageModeState | null>(null);

    public readonly topResults = computed<StickerCollageVoteResult[]>(() => {
        return (this.modeState()?.lastVoteResults ?? []).slice(0, 3);
    });

    public readonly winnerId = computed(() => this.modeState()?.winnerId ?? null);
    public readonly winnerChoicesDone = computed(() => this.modeState()?.winnerChoicesDone ?? false);

    /** Check if winner already chose the prompt (stored in promptHistory for next round) */
    public readonly promptChosen = computed(() => {
        const ms = this.modeState();
        if (!ms) return false;
        return !!ms.promptHistory[ms.currentRoundIndex + 1];
    });

    /** Check if winner already unlocked a pack */
    public readonly packUnlocked = computed(() => {
        return !!this.modeState()?.lastUnlockedPackId;
    });

    /** Check if winner already chose the guaranteed pack (winnerChoicesDone is set when guaranteed is picked) */
    public readonly guaranteedChosen = computed(() => {
        return this.modeState()?.winnerChoicesDone ?? false;
    });

    public getPlayer(playerId: string): SessionPlayer | undefined {
        return this.worldStore.players()[playerId];
    }

    public advanceFromResults(): void {
        const action: StickerCollageClientAction = {type: "advance-from-results"};
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}
