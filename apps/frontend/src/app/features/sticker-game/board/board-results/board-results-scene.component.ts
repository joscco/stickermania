import {Component, computed, inject, input, AfterViewInit, ElementRef} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../../core/world.store";
import {WebSocketService} from "../../../../core/websocket.service";
import type {
    StickerCollageClientAction,
    StickerCollageModeState,
    StickerCollageVoteResult,
    SessionPlayer,
} from "@birthday/shared";
import gsap from "gsap";

@Component({
    selector: "app-board-results-scene",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./board-results-scene.component.html",
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

