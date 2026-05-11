import {Component, computed, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {
    StickerCollageGameState,
    StickerCollageVoteResult,
    StickerCollageResultsState,
    StickerCollage,
    SessionPlayer,
} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {BoardPlayerAvatarComponent} from '../../player-avatar/board-player-avatar.component';
import {SvgComponent} from '../../../../shared/svg/svg.component';
import {PromptBannerComponent} from '../../../../shared/prompt-banner/prompt-banner.component';
import {StarsDisplayComponent} from '../../../shared/stars-display.component';

interface PodiumSlot {
    placement: number;
    result: StickerCollageVoteResult;
    medalIcon: string;
    medalW: number;
    stepIcon: string;
    imgSize: string;
    stepW: string;
    borderClass: string;
    shadowClass: string;
    stepColor: string;
    starSize: number;
    starColor: string;
    camW: number;
}

@Component({
    selector: "app-board-results-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, BoardPlayerAvatarComponent, SvgComponent, PromptBannerComponent, StarsDisplayComponent],
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

    public readonly podiumSlots = computed<PodiumSlot[]>(() => {
        const results = this.topResults();
        const config: Record<number, Omit<PodiumSlot, 'placement' | 'result'>> = {
            1: {medalIcon: 'icon-medal-gold-lg', medalW: 32, stepIcon: 'podium-step-1', imgSize: 'w-44 h-44', stepW: 'w-44', borderClass: 'border-black', shadowClass: 'shadow-xl', stepColor: 'text-black', starSize: 16, starColor: 'text-amber-500', camW: 60},
            2: {medalIcon: 'icon-medal-silver-lg', medalW: 28, stepIcon: 'podium-step-2', imgSize: 'w-36 h-36', stepW: 'w-36', borderClass: 'border-stone-400', shadowClass: 'shadow-lg', stepColor: 'text-stone-400', starSize: 14, starColor: 'text-stone-400', camW: 50},
            3: {medalIcon: 'icon-medal-bronze-lg', medalW: 28, stepIcon: 'podium-step-3', imgSize: 'w-36 h-36', stepW: 'w-36', borderClass: 'border-stone-300', shadowClass: 'shadow-lg', stepColor: 'text-stone-300', starSize: 14, starColor: 'text-stone-400', camW: 50},
        };
        const displayOrder = [1, 0, 2];
        return displayOrder
            .map(i => results[i] ? {placement: i + 1, result: results[i], ...config[i + 1]} : null)
            .filter((s): s is PodiumSlot => s !== null);
    });

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

    public readonly currentRoundSubmissions = computed<StickerCollage[]>(() => {
        const ms = this.gameState();
        if (!ms) return [];
        return ms.submissions[ms.currentRoundIndex] ?? [];
    });

    public getSnapshotUrl(playerId: string): string | null {
        const subs = this.currentRoundSubmissions();
        const sub = subs.find(s => s.playerId === playerId);
        return sub?.snapshotUrl ?? null;
    }

    public getPlayer(playerId: string): SessionPlayer | undefined {
        return this.players()[playerId];
    }
}