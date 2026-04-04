import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../core/world.store";
import type {StickerCollage, StickerCollageModeState, StickerCollageVoteResult} from "@birthday/shared";

/**
 * Board/TV display for the sticker-collage game.
 * Shows current prompt, submissions from last round, vote results, etc.
 */
@Component({
    selector: "app-sticker-board-scene",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="h-full flex flex-col">
            <!-- Prompt display -->
            <div class="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 text-center rounded-xl mb-4">
                <span class="text-sm font-medium opacity-70">Runde {{ modeState()?.currentRoundIndex ?? 0 }}</span>
                <h1 class="text-2xl font-bold mt-1">{{ modeState()?.currentPrompt ?? '' }}</h1>
                <span class="text-xs opacity-60 mt-1 block">{{ modeState()?.phase === 'BUILDING' ? '🎨 Baut eure Collagen!' : '🏆 Ergebnisse' }}</span>
            </div>

            <!-- Vote results from last round (if any) -->
            @if (lastVoteResults().length > 0) {
                <div class="mb-4">
                    <h3 class="text-sm font-semibold text-stone-600 mb-2 px-2">🏆 Ergebnisse der letzten Runde</h3>
                    <div class="grid grid-cols-3 gap-3">
                        @for (result of topResults(); track result.collageId; let i = $index) {
                            <div class="bg-white rounded-xl border border-black/6 overflow-hidden shadow-sm"
                                 [class.ring-2]="i === 0"
                                 [class.ring-amber-400]="i === 0">
                                <div class="relative aspect-square bg-stone-50 overflow-hidden">
                                    @for (placement of getCollage(result.collageId)?.placements ?? []; track placement.instanceId) {
                                        <img
                                            [src]="getStickerUrl(placement.stickerId)"
                                            [alt]="placement.stickerId"
                                            class="absolute w-10 h-10 object-contain"
                                            [style.left.px]="placement.x * 0.5"
                                            [style.top.px]="placement.y * 0.5"
                                            [style.transform]="'rotate(' + placement.rotation + 'deg) scale(' + (placement.scale * 0.5) + ')'"
                                            draggable="false"
                                        />
                                    }
                                </div>
                                <div class="px-3 py-2 flex items-center justify-between">
                                    <div>
                                        <div class="text-xs font-semibold text-stone-700">{{ getPlayerName(result.playerId) }}</div>
                                        <div class="text-xs text-stone-400">{{ result.voteCount }} Stimmen</div>
                                    </div>
                                    <div class="text-right">
                                        @if (i === 0) {
                                            <span class="text-lg">🥇</span>
                                        } @else if (i === 1) {
                                            <span class="text-lg">🥈</span>
                                        } @else if (i === 2) {
                                            <span class="text-lg">🥉</span>
                                        }
                                        @if (result.pointsAwarded > 0) {
                                            <div class="text-xs font-bold text-amber-600">+{{ result.pointsAwarded }}</div>
                                        }
                                    </div>
                                </div>
                            </div>
                        }
                    </div>
                </div>
            }

            <!-- Current round submissions count -->
            <div class="flex-1 flex flex-col items-center justify-center text-stone-400">
                <div class="text-6xl mb-4">🎨</div>
                <p class="text-lg font-medium text-stone-600">{{ currentRoundSubmissionCount() }} Einreichungen</p>
                <p class="text-sm text-stone-400 mt-1">{{ playerCount() }} Spieler online</p>
            </div>
        </div>
    `,
})
export class StickerBoardSceneComponent {
    private readonly worldStore = inject(WorldStore);

    public readonly modeState = computed<StickerCollageModeState | null>(() => {
        return this.worldStore.stickerCollageModeState();
    });

    public readonly lastVoteResults = computed<StickerCollageVoteResult[]>(() => {
        return this.modeState()?.lastVoteResults ?? [];
    });

    public readonly topResults = computed(() => {
        return this.lastVoteResults().slice(0, 3);
    });

    public readonly currentRoundSubmissionCount = computed(() => {
        const ms = this.modeState();
        if (!ms) return 0;
        return (ms.submissions[ms.currentRoundIndex] ?? []).length;
    });

    public readonly playerCount = computed(() => {
        return Object.values(this.worldStore.players()).filter(p => p.connected).length;
    });

    private catalogMap = new Map<string, {imageUrl: string}>();

    public getStickerUrl(stickerId: string): string {
        const ms = this.modeState();
        if (!ms) return "";
        if (this.catalogMap.size !== ms.stickerCatalog.length) {
            this.catalogMap.clear();
            for (const s of ms.stickerCatalog) {
                this.catalogMap.set(s.id, s);
            }
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public getPlayerName(playerId: string): string {
        return this.worldStore.players()[playerId]?.name ?? "Anonym";
    }

    public getCollage(collageId: string): StickerCollage | undefined {
        const ms = this.modeState();
        if (!ms) return undefined;
        // Search across all rounds
        for (const roundSubs of Object.values(ms.submissions)) {
            const found = roundSubs.find(c => c.id === collageId);
            if (found) return found;
        }
        return undefined;
    }
}

