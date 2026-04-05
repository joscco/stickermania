import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollageClientAction, SessionPlayer} from "@birthday/shared";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {BoardQrPanelComponent} from '../../qr-panel/board-qr-panel.component';

@Component({
    selector: "app-board-lobby-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective, BoardQrPanelComponent],
    templateUrl: "./board-lobby-scene.component.html",
})
export class BoardLobbySceneComponent {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly sessionCode = input<string | null>(null);
    public readonly playerQrDataUrl = input<string | null>(null);
    public readonly wifiQrDataUrl = input<string | null>(null);

    public readonly connectedPlayers = computed<SessionPlayer[]>(() => {
        return Object.values(this.worldStore.players()).filter(p => p.connected);
    });

    public startGame(): void {
        const action: StickerCollageClientAction = {type: "start-game"};
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}
