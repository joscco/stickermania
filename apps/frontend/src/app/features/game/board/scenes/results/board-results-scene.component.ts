import {AfterViewInit, Component, computed, ElementRef, input, OnDestroy, output, signal, ViewChild} from "@angular/core";
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

/** Approximate ideal pixel height needed to show the podium at scale 1 (3 columns with trophies). */
const PODIUM_IDEAL_H = 420;

interface PodiumSlot {
    placement: number;
    result: StickerCollageVoteResult;
    medalIcon: string;
    medalW: number;
    imgSizeClass: string;
    borderClass: string;
    shadowClass: string;
    barHeightClass: string;
    barColorClass: string;
    starSize: number;
    starColor: string;
    camW: number;
    isTied: boolean;
}

@Component({
    selector: "app-board-results-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, BoardPlayerAvatarComponent, SvgComponent, PromptBannerComponent, StarsDisplayComponent],
    templateUrl: "./board-results-scene.component.html",
})
export class BoardResultsSceneComponent implements AfterViewInit, OnDestroy {
    public readonly gameState = input<StickerCollageGameState | null>(null);
    public readonly players = input<Record<string, SessionPlayer>>({});
    public readonly advanceFromResults = output<void>();

    // ── Podium proportional scaling ──────────────────────────────

    @ViewChild('podiumArea') private podiumArea!: ElementRef<HTMLDivElement>;

    /** Scale factor (0–1) that shrinks the whole podium when vertical space is tight. */
    public readonly podiumScale = signal(1);

    private resizeObserver: ResizeObserver | null = null;

    ngAfterViewInit(): void {
        const el = this.podiumArea?.nativeElement;
        if (!el) return;
        const update = () => {
            const h = el.clientHeight;
            this.podiumScale.set(Math.max(0.3, Math.min(1, h / PODIUM_IDEAL_H)));
        };
        // Wait one frame so the flex layout has settled
        requestAnimationFrame(update);
        this.resizeObserver = new ResizeObserver(update);
        this.resizeObserver.observe(el);
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }

    // ── Data helpers ─────────────────────────────────────────────

    private get resultsPs(): StickerCollageResultsState | null {
        const ps = this.gameState()?.phaseState;
        return ps?.phase === "RESULTS" ? ps : null;
    }

    public readonly topResults = computed<StickerCollageVoteResult[]>(() => {
        const results = this.resultsPs?.lastVoteResults ?? [];
        const seen = new Set<number>();
        const top: StickerCollageVoteResult[] = [];
        for (const r of results) {
            if (!seen.has(r.placement)) {
                seen.add(r.placement);
                top.push(r);
            }
            if (seen.size >= 3) break;
        }
        return top;
    });

    public readonly podiumSlots = computed<PodiumSlot[]>(() => {
        const results = this.topResults();
        const allResults = this.resultsPs?.lastVoteResults ?? [];
        const config: Record<number, Omit<PodiumSlot, 'placement' | 'result' | 'isTied'>> = {
            1: {medalIcon: 'icon-medal-gold-lg', medalW: 65, imgSizeClass: 'w-28 sm:w-36 md:w-44', borderClass: 'border-yellow-400', shadowClass: 'shadow-xl', barColorClass: 'bg-yellow-400', barHeightClass: 'h-8', starSize: 16, starColor: 'text-amber-500', camW: 60},
            2: {medalIcon: 'icon-medal-silver-lg', medalW: 60, imgSizeClass: 'w-24 sm:w-32 md:w-36', borderClass: 'border-stone-400', shadowClass: 'shadow-lg', barColorClass: 'bg-stone-300', barHeightClass: 'h-5', starSize: 14, starColor: 'text-stone-400', camW: 50},
            3: {medalIcon: 'icon-medal-bronze-lg', medalW: 55, imgSizeClass: 'w-24 sm:w-32 md:w-36', borderClass: 'border-amber-700', shadowClass: 'shadow-lg', barColorClass: 'bg-amber-700', barHeightClass: 'h-3', starSize: 14, starColor: 'text-stone-400', camW: 50},
        };
        const displayOrder = [1, 0, 2];
        return displayOrder
            .map(i => {
                const result = results[i];
                if (!result) return null;
                const tiedCount = allResults.filter(r => r.placement === result.placement && r.playerId !== result.playerId).length;
                return {placement: result.placement, result, isTied: tiedCount > 0, ...config[result.placement <= 3 ? result.placement : 3]};
            })
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
