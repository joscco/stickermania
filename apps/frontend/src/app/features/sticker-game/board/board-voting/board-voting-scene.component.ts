import {Component, computed, inject, input, signal, OnInit, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../../core/world.store";
import {WebSocketService} from "../../../../core/websocket.service";
import type {StickerCollageClientAction, StickerCollageModeState, StickerCollage, SessionPlayer} from "@birthday/shared";

@Component({
    selector: "app-board-voting-scene",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="h-full flex flex-col">
            <!-- Voting banner -->
            <div class="bg-linear-to-r from-amber-500 to-orange-500 text-white px-8 py-5 text-center rounded-2xl mx-4 mt-4 shadow-lg">
                <span class="text-sm font-medium opacity-70 uppercase tracking-wider">Abstimmung</span>
                <h1 class="text-3xl font-black mt-1">{{ modeState()?.currentPrompt ?? '' }}</h1>
            </div>

            <!-- Slideshow strip -->
            <div class="flex-1 flex items-center overflow-hidden mt-4">
                <div class="flex gap-6 animate-scroll-left px-4"
                     [style.animation-duration]="scrollDuration()">
                    @for (sub of doubledSubmissions(); track $index) {
                        <div class="shrink-0 w-64 flex flex-col items-center gap-2">
                            <div class="w-64 h-64 rounded-2xl overflow-hidden bg-white shadow-lg border border-black/6">
                                @if (sub.snapshotUrl) {
                                    <img [src]="sub.snapshotUrl" alt="Collage"
                                         class="w-full h-full object-contain" draggable="false" />
                                } @else {
                                    <div class="w-full h-full grid place-items-center text-4xl text-stone-300">🖼️</div>
                                }
                            </div>
                            <!-- Player info -->
                            <div class="flex items-center gap-2">
                                @if (getPlayer(sub.playerId)?.avatarUrl; as url) {
                                    <img [src]="url" alt=""
                                         class="w-8 h-8 rounded-xl border border-stone-200 bg-white object-cover"
                                         (error)="$any($event.target).style.display='none'" />
                                }
                                <span class="text-sm font-semibold text-stone-700">
                                    {{ getPlayer(sub.playerId)?.name ?? 'Spieler' }}
                                </span>
                            </div>
                        </div>
                    }
                </div>
            </div>

            <!-- End voting button -->
            <div class="text-center pb-6">
                <button
                    class="bg-orange-500 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow-lg hover:bg-orange-600 active:scale-95 transition-all"
                    (click)="endVotingEarly()"
                >
                    Abstimmung beenden ⏩
                </button>
            </div>
        </div>
    `,
    styles: [`
        @keyframes scroll-left {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
        }
        .animate-scroll-left {
            animation: scroll-left linear infinite;
        }
    `],
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

