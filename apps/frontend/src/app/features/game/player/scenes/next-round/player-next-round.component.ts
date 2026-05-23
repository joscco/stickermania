import {Component, input} from "@angular/core";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PlayerStatusScreenComponent} from '../../player-status-screen/player-status-screen.component';

@Component({
    selector: "app-player-next-round",
    standalone: true,
  imports: [PlayerStatusScreenComponent, AnimOnInitDirective],
    templateUrl: "./player-next-round.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerNextRoundComponent {
    public readonly hasNewPack = input<boolean>(false);
}
