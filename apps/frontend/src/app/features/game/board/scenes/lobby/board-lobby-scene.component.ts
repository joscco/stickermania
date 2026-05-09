import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer} from "@birthday/shared";
import {AnimGroupDirective, AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {BoardPlayerAvatarComponent} from '../../player-avatar/board-player-avatar.component';

@Component({
  selector: "app-board-lobby-scene",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective, BoardPlayerAvatarComponent],
  templateUrl: "./board-lobby-scene.component.html",
})
export class BoardLobbySceneComponent {
  public readonly connectedPlayers = input<SessionPlayer[]>([]);
  public readonly startGame = output<void>();
}