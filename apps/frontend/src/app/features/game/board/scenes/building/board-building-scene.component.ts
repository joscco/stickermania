import {Component, computed, inject, input, AfterViewInit, ElementRef} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageClientAction, StickerCollageModeState, SessionPlayer, StickerPack} from "@birthday/shared";
import gsap from "gsap";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';

@Component({
    selector: "app-board-building-scene",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./board-building-scene.component.html",
})
export class BoardBuildingSceneComponent implements AfterViewInit {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);
    private readonly el = inject(ElementRef);

    public readonly modeState = input<StickerCollageModeState | null>(null);

    public ngAfterViewInit(): void {
        const banner = this.el.nativeElement.querySelector('.anim-banner');
        const items = this.el.nativeElement.querySelectorAll('.anim-item');
        const players = this.el.nativeElement.querySelector('.anim-players');
        if (banner) gsap.fromTo(banner, {opacity: 0, y: -30}, {opacity: 1, y: 0, duration: 0.5, ease: "power2.out"});
        if (players) gsap.fromTo(players, {opacity: 0, scale: 0.95}, {opacity: 1, scale: 1, duration: 0.4, delay: 0.2, ease: "power2.out"});
        if (items.length) gsap.fromTo(items, {opacity: 0, y: 20}, {opacity: 1, y: 0, duration: 0.4, stagger: 0.1, delay: 0.3, ease: "power2.out"});
    }

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
