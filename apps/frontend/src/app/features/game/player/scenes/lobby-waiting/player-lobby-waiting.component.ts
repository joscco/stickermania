import {Component, output} from "@angular/core";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PlayerStatusScreenComponent} from '../player-status-screen.component';

@Component({
    selector: "app-player-lobby-waiting",
    standalone: true,
  imports: [AnimOnInitDirective, PlayerStatusScreenComponent],
    templateUrl: "./player-lobby-waiting.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerLobbyWaitingComponent {
    public readonly startGame = output<void>();
}
