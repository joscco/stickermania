import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../../core/world.store";
import {WebSocketService} from "../../../../core/websocket.service";
import type {StickerCollageClientAction, StickerCollageModeState, SessionPlayer, StickerPack} from "@birthday/shared";

@Component({
    selector: "app-board-building-scene",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="h-full flex flex-col">
            <!-- Prompt banner -->
            <div class="bg-linear-to-r from-purple-600 to-pink-500 text-white px-8 py-6 text-center rounded-2xl mx-4 mt-4 shadow-lg">
                <span class="text-sm font-medium opacity-70 uppercase tracking-wider">Runde {{ modeState()?.currentRoundIndex ?? 0 }}</span>
                <h1 class="text-3xl font-black mt-1">{{ modeState()?.currentPrompt ?? '' }}</h1>
            </div>

            <!-- Round info: newly unlocked pack + guaranteed pack -->
            @if (lastUnlockedPack() || guaranteedPack()) {
                <div class="flex justify-center gap-6 mt-4 px-4">
                    @if (lastUnlockedPack(); as pack) {
                        <div class="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-center">
                            <div class="text-xs text-emerald-600 font-semibold uppercase tracking-wider">Neu freigeschaltet</div>
                            <div class="text-lg font-bold text-emerald-800">{{ pack.name }}</div>
                        </div>
                    }
                    @if (guaranteedPack(); as pack) {
                        <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
                            <div class="text-xs text-amber-600 font-semibold uppercase tracking-wider">Auf jeden Fall dabei</div>
                            <div class="text-lg font-bold text-amber-800">{{ pack.name }}</div>
                        </div>
                    }
                </div>
            }

            <!-- Player status -->
            <div class="flex-1 flex flex-col items-center justify-center px-8">
                <div class="flex flex-wrap justify-center gap-4 max-w-3xl">
                    @for (player of connectedPlayers(); track player.id) {
                        <div class="flex flex-col items-center gap-1.5 transition-all"
                             [class.opacity-40]="!isDrawing(player.id) && !hasSubmitted(player.id)">
                            <div class="relative">
                                @if (player.avatarUrl) {
                                    <img [src]="player.avatarUrl" [alt]="player.name"
                                         class="w-14 h-14 rounded-2xl border-2 bg-white object-cover shadow-md"
                                         [class.border-purple-400]="isDrawing(player.id)"
                                         [class.border-emerald-400]="hasSubmitted(player.id)"
                                         [class.border-stone-200]="!isDrawing(player.id) && !hasSubmitted(player.id)"
                                         (error)="$any($event.target).style.display='none'" />
                                } @else {
                                    <div class="w-14 h-14 rounded-2xl border-2 bg-stone-100 grid place-items-center text-xl shadow-md"
                                         [class.border-purple-400]="isDrawing(player.id)"
                                         [class.border-emerald-400]="hasSubmitted(player.id)"
                                         [class.border-stone-200]="!isDrawing(player.id) && !hasSubmitted(player.id)">
                                        🙂
                                    </div>
                                }
                                @if (hasSubmitted(player.id)) {
                                    <div class="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full grid place-items-center text-white text-xs shadow">✓</div>
                                } @else if (isDrawing(player.id)) {
                                    <div class="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 rounded-full grid place-items-center text-white text-xs shadow animate-pulse">🎨</div>
                                }
                            </div>
                            <span class="text-xs font-medium text-stone-600 max-w-14 truncate">{{ player.name || 'Spieler' }}</span>
                        </div>
                    }
                </div>

                <div class="mt-8 text-center">
                    <p class="text-lg font-medium text-stone-600">{{ submissionCount() }}/{{ connectedPlayers().length }} eingereicht</p>
                </div>
            </div>

            <!-- End round button -->
            <div class="text-center pb-6">
                <button
                    class="bg-orange-500 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow-lg hover:bg-orange-600 active:scale-95 transition-all"
                    (click)="endRoundEarly()"
                >
                    Runde beenden ⏩
                </button>
            </div>
        </div>
    `,
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

