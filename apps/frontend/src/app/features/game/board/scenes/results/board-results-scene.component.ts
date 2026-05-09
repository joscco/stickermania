import {Component, computed, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {
    StickerCollageGameState,
    StickerCollageVoteResult,
    StickerCollageResultsState,
    SessionPlayer,
} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {BoardPlayerAvatarComponent} from '../../player-avatar/board-player-avatar.component';
import {SvgComponent} from '../../../../shared/svg/svg.component';

@Component({
    selector: "app-board-results-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, BoardPlayerAvatarComponent, SvgComponent],
    templateUrl: "./board-results-scene.component.html",
})
export class BoardResultsSceneComponent {
    public readonly gameState = input<StickerCollageGameState | null>(null);
    public readonly players = input<Record<string, SessionPlayer>>({});
    public readonly advanceFromResults = output<void>();

    private get resultsPs(): StickerCollageResultsState | null {
        const ps = this.gameState()?.phaseState;
        return ps?.phase === "RESULTS" ? ps : null;
    }

    public readonly topResults = computed<StickerCollageVoteResult[]>(() =>
        (this.resultsPs?.lastVoteResults ?? []).slice(0, 3)
    );

    public readonly winnerId = computed(() => this.resultsPs?.winnerId ?? null);
    public readonly winnerChoicesDone = computed(() => this.resultsPs?.winnerChoicesDone ?? false);

    public readonly promptChosen = computed(() => {
        const ms = this.gameState();
        if (!ms) return false;
        return !!ms.promptHistory[ms.currentRoundIndex + 1];
    });

    public readonly packUnlocked = computed(() => !!(this.resultsPs?.lastUnlockedPackId));

    public readonly guaranteedChosen = computed(() => this.resultsPs?.winnerChoicesDone ?? false);

    public readonly readyToAdvanceCount = computed(() => this.resultsPs?.readyToAdvanceIds.length ?? 0);

    public getPlayer(playerId: string): SessionPlayer | undefined {
        return this.players()[playerId];
    }
}