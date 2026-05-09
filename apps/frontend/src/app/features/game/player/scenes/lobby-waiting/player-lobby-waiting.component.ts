import {Component, output} from "@angular/core";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';

@Component({
    selector: "app-player-lobby-waiting",
    standalone: true,
    imports: [AnimOnInitDirective, AnimGroupDirective, SvgComponent],
    templateUrl: "./player-lobby-waiting.component.html",
    host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerLobbyWaitingComponent {
    public readonly startGame = output<void>();
}
