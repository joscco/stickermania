import {Component, computed, inject, input, AfterViewInit, ElementRef} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../../core/world.store";
import {WebSocketService} from "../../../../core/websocket.service";
import type {StickerCollageClientAction, StickerCollageModeState, StickerCollage, SessionPlayer} from "@birthday/shared";
import gsap from "gsap";

@Component({
    selector: "app-board-voting-scene",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./board-voting-scene.component.html",
    styleUrl: "./board-voting-scene.component.css",
})
export class BoardVotingSceneComponent implements AfterViewInit {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);
    private readonly el = inject(ElementRef);

    public readonly modeState = input<StickerCollageModeState | null>(null);

    public ngAfterViewInit(): void {
        const banner = this.el.nativeElement.querySelector('.anim-banner');
        const strip = this.el.nativeElement.querySelector('.anim-strip');
        const items = this.el.nativeElement.querySelectorAll('.anim-item');
        if (banner) gsap.fromTo(banner, {opacity: 0, y: -30}, {opacity: 1, y: 0, duration: 0.5, ease: "power2.out"});
        if (strip) gsap.fromTo(strip, {opacity: 0, x: 60}, {opacity: 1, x: 0, duration: 0.6, delay: 0.2, ease: "power2.out"});
        if (items.length) gsap.fromTo(items, {opacity: 0, y: 20}, {opacity: 1, y: 0, duration: 0.4, stagger: 0.1, delay: 0.4, ease: "power2.out"});
    }

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
