import {Component} from "@angular/core";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PlayerStatusScreenComponent} from '../player-status-screen.component';

@Component({
    selector: "app-player-reconnecting",
    standalone: true,
  imports: [AnimOnInitDirective, PlayerStatusScreenComponent],
    templateUrl: "./player-reconnecting.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerReconnectingComponent {}
