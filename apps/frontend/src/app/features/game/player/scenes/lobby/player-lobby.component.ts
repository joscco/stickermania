import {Component} from "@angular/core";
import {CommonModule} from "@angular/common";
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-player-lobby",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective],
    templateUrl: "./player-lobby.component.html",
})
export class PlayerLobbyComponent {}

