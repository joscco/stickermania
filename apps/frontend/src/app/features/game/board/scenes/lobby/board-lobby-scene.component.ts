import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer, StickerCollageClientAction} from "@birthday/shared";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {AnimGroupDirective, AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {BoardPlayerAvatarComponent} from '../../player-avatar/board-player-avatar.component';

@Component({
  selector: "app-board-lobby-scene",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective, BoardPlayerAvatarComponent],
  templateUrl: "./board-lobby-scene.component.html",
})
export class BoardLobbySceneComponent {
  private readonly worldStore = inject(WorldStore);
  private readonly wsService = inject(WebSocketService);

  public readonly connectedPlayers = computed<SessionPlayer[]>(() => {
    return Object.values(this.worldStore.players()).filter(p => p.connected);
  });

  public startGame(): void {
    const action: StickerCollageClientAction = {type: "start-game"};
    this.wsService.send({type: "game-action", action});
  }
}
