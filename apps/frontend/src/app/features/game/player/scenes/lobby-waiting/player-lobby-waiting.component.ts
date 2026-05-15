import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PlayerStatusScreenComponent} from '../player-status-screen.component';
import {BoardPlayerAvatarComponent} from '../../../board/player-avatar/board-player-avatar.component';

@Component({
    selector: "app-player-lobby-waiting",
    standalone: true,
  imports: [CommonModule, AnimOnInitDirective, PlayerStatusScreenComponent, BoardPlayerAvatarComponent],
    templateUrl: "./player-lobby-waiting.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerLobbyWaitingComponent {
    public readonly connectedPlayers = input<SessionPlayer[]>([]);
    public readonly startGame = output<void>();
}
