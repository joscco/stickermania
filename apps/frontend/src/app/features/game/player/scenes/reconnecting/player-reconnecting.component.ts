import {Component} from "@angular/core";
import {PlayerStatusScreenComponent} from '../../player-status-screen/player-status-screen.component';

@Component({
    selector: "app-player-reconnecting",
    standalone: true,
  imports: [PlayerStatusScreenComponent],
    templateUrl: "./player-reconnecting.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerReconnectingComponent {}
