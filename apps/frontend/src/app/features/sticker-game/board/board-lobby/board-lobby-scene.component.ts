import {Component, computed, inject, input, AfterViewInit, ElementRef} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../../core/world.store";
import {WebSocketService} from "../../../../core/websocket.service";
import type {StickerCollageClientAction, SessionPlayer} from "@birthday/shared";
import gsap from "gsap";

@Component({
    selector: "app-board-lobby-scene",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./board-lobby-scene.component.html",
})
export class BoardLobbySceneComponent implements AfterViewInit {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);
    private readonly el = inject(ElementRef);

    public readonly sessionCode = input<string | null>(null);
    public readonly playerQrDataUrl = input<string | null>(null);
    public readonly wifiQrDataUrl = input<string | null>(null);

    public readonly connectedPlayers = computed<SessionPlayer[]>(() => {
        return Object.values(this.worldStore.players()).filter(p => p.connected);
    });

    public ngAfterViewInit(): void {
        const items = this.el.nativeElement.querySelectorAll('.anim-item');
        gsap.fromTo(items, {opacity: 0, y: 30}, {opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power2.out"});
    }

    public startGame(): void {
        const action: StickerCollageClientAction = {type: "start-game"};
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}
