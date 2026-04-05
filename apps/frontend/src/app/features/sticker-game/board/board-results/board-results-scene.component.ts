import {Component, computed, inject, input, AfterViewInit, ElementRef} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../../core/world.store";
import {WebSocketService} from "../../../../core/websocket.service";
import type {
    StickerCollageClientAction,
    StickerCollageModeState,
    StickerCollageVoteResult,
    StickerCollage,
    SessionPlayer,
} from "@birthday/shared";
import gsap from "gsap";

@Component({
    selector: "app-board-results-scene",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="h-full flex flex-col">
            <!-- Results header -->
            <div class="bg-linear-to-r from-yellow-400 to-amber-500 text-white px-8 py-5 text-center rounded-2xl mx-4 mt-4 shadow-lg anim-banner">
                <h1 class="text-3xl font-black">🏆 Ergebnisse</h1>
            </div>

            <!-- Podium -->
            <div class="flex-1 flex items-end justify-center gap-4 pb-8 px-4 mt-4 anim-podium">
                <!-- 2nd place -->
                @if (topResults().length > 1) {
                    <div class="flex flex-col items-center">
                        <!-- Avatar + medal -->
                        <div class="relative mb-2">
                            @if (getPlayer(topResults()[1].playerId)?.avatarUrl; as url) {
                                <img [src]="url" alt="" class="w-20 h-20 rounded-2xl border-4 border-stone-300 bg-white object-cover shadow-lg"
                                     (error)="$any($event.target).style.display='none'" />
                            } @else {
                                <div class="w-20 h-20 rounded-2xl border-4 border-stone-300 bg-stone-100 grid place-items-center text-3xl shadow-lg">🙂</div>
                            }
                            <div class="absolute -top-3 -right-3 text-3xl">🥈</div>
                        </div>
                        <span class="text-sm font-bold text-stone-700 mb-1">{{ getPlayer(topResults()[1].playerId)?.name ?? 'Spieler' }}</span>
                        <span class="text-xs text-stone-500">{{ topResults()[1].voteCount }} Stimmen · +{{ topResults()[1].pointsAwarded }}</span>
                        <!-- Podium block -->
                        <div class="w-32 h-28 bg-stone-200 rounded-t-xl mt-2 flex items-center justify-center">
                            <span class="text-5xl font-black text-stone-400">2</span>
                        </div>
                    </div>
                }

                <!-- 1st place -->
                @if (topResults().length > 0) {
                    <div class="flex flex-col items-center">
                        <div class="relative mb-2">
                            @if (getPlayer(topResults()[0].playerId)?.avatarUrl; as url) {
                                <img [src]="url" alt="" class="w-24 h-24 rounded-2xl border-4 border-amber-400 bg-white object-cover shadow-lg"
                                     (error)="$any($event.target).style.display='none'" />
                            } @else {
                                <div class="w-24 h-24 rounded-2xl border-4 border-amber-400 bg-stone-100 grid place-items-center text-4xl shadow-lg">🙂</div>
                            }
                            <div class="absolute -top-4 -right-4 text-4xl">🥇</div>
                        </div>
                        <span class="text-base font-black text-stone-800 mb-1">{{ getPlayer(topResults()[0].playerId)?.name ?? 'Spieler' }}</span>
                        <span class="text-xs text-stone-500">{{ topResults()[0].voteCount }} Stimmen · +{{ topResults()[0].pointsAwarded }}</span>
                        <div class="w-36 h-40 bg-amber-300 rounded-t-xl mt-2 flex items-center justify-center">
                            <span class="text-6xl font-black text-amber-600">1</span>
                        </div>
                    </div>
                }

                <!-- 3rd place -->
                @if (topResults().length > 2) {
                    <div class="flex flex-col items-center">
                        <div class="relative mb-2">
                            @if (getPlayer(topResults()[2].playerId)?.avatarUrl; as url) {
                                <img [src]="url" alt="" class="w-20 h-20 rounded-2xl border-4 border-orange-300 bg-white object-cover shadow-lg"
                                     (error)="$any($event.target).style.display='none'" />
                            } @else {
                                <div class="w-20 h-20 rounded-2xl border-4 border-orange-300 bg-stone-100 grid place-items-center text-3xl shadow-lg">🙂</div>
                            }
                            <div class="absolute -top-3 -right-3 text-3xl">🥉</div>
                        </div>
                        <span class="text-sm font-bold text-stone-700 mb-1">{{ getPlayer(topResults()[2].playerId)?.name ?? 'Spieler' }}</span>
                        <span class="text-xs text-stone-500">{{ topResults()[2].voteCount }} Stimmen · +{{ topResults()[2].pointsAwarded }}</span>
                        <div class="w-32 h-20 bg-orange-200 rounded-t-xl mt-2 flex items-center justify-center">
                            <span class="text-5xl font-black text-orange-400">3</span>
                        </div>
                    </div>
                }
            </div>

            <!-- Winner action status -->
            <div class="mx-4 mb-4 p-4 bg-stone-50 rounded-2xl border border-stone-200 anim-item">
                @if (winnerId() && !winnerChoicesDone()) {
                    <div class="text-center">
                        <p class="text-lg font-bold text-stone-800">
                            {{ getPlayer(winnerId()!)?.name ?? 'Der Gewinner' }}, stimme für die nächste Runde ab!
                        </p>
                        <div class="flex justify-center gap-4 mt-3">
                            <!-- Step 1: Prompt -->
                            <div class="flex flex-col items-center gap-1"
                                 [class.opacity-30]="promptChosen()">
                                <div class="w-10 h-10 rounded-full grid place-items-center text-lg shadow-sm"
                                     [class.bg-emerald-100]="promptChosen()"
                                     [class.text-emerald-600]="promptChosen()"
                                     [class.bg-purple-100]="!promptChosen()"
                                     [class.text-purple-600]="!promptChosen()">
                                    @if (promptChosen()) { ✓ } @else { 🎯 }
                                </div>
                                <span class="text-xs text-stone-500">Prompt</span>
                            </div>
                            <!-- Step 2: Pack unlock -->
                            <div class="flex flex-col items-center gap-1"
                                 [class.opacity-30]="packUnlocked()">
                                <div class="w-10 h-10 rounded-full grid place-items-center text-lg shadow-sm"
                                     [class.bg-emerald-100]="packUnlocked()"
                                     [class.text-emerald-600]="packUnlocked()"
                                     [class.bg-purple-100]="!packUnlocked()"
                                     [class.text-purple-600]="!packUnlocked()">
                                    @if (packUnlocked()) { ✓ } @else { 🔓 }
                                </div>
                                <span class="text-xs text-stone-500">Pack</span>
                            </div>
                            <!-- Step 3: Guaranteed pack -->
                            <div class="flex flex-col items-center gap-1"
                                 [class.opacity-30]="guaranteedChosen()">
                                <div class="w-10 h-10 rounded-full grid place-items-center text-lg shadow-sm"
                                     [class.bg-emerald-100]="guaranteedChosen()"
                                     [class.text-emerald-600]="guaranteedChosen()"
                                     [class.bg-purple-100]="!guaranteedChosen()"
                                     [class.text-purple-600]="!guaranteedChosen()">
                                    @if (guaranteedChosen()) { ✓ } @else { ⭐ }
                                </div>
                                <span class="text-xs text-stone-500">Garantiert</span>
                            </div>
                        </div>
                    </div>
                } @else if (winnerChoicesDone()) {
                    <div class="text-center">
                        <p class="text-lg font-bold text-emerald-700">✅ Auswahl getroffen!</p>
                    </div>
                }
            </div>

            <div class="text-center pb-6 anim-item">
                <button
                    class="bg-purple-600 text-white px-8 py-3 rounded-xl text-lg font-semibold shadow-lg hover:bg-purple-700 active:scale-95 transition-all"
                    (click)="advanceFromResults()"
                >
                    Nächste Runde ⏩
                </button>
            </div>
        </div>
    `,
})
export class BoardResultsSceneComponent implements AfterViewInit {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);
    private readonly el = inject(ElementRef);

    public readonly modeState = input<StickerCollageModeState | null>(null);

    public ngAfterViewInit(): void {
        const banner = this.el.nativeElement.querySelector('.anim-banner');
        const podium = this.el.nativeElement.querySelector('.anim-podium');
        const items = this.el.nativeElement.querySelectorAll('.anim-item');
        if (banner) gsap.fromTo(banner, {opacity: 0, scale: 0.8}, {opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.5)"});
        if (podium) gsap.fromTo(podium, {opacity: 0, y: 80}, {opacity: 1, y: 0, duration: 0.7, delay: 0.3, ease: "power3.out"});
        if (items.length) gsap.fromTo(items, {opacity: 0, y: 20}, {opacity: 1, y: 0, duration: 0.4, stagger: 0.15, delay: 0.7, ease: "power2.out"});
    }

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

