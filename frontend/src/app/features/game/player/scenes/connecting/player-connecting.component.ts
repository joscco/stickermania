import {Component} from "@angular/core";
import {PlayerStatusScreenComponent} from '../../player-status-screen/player-status-screen.component';

@Component({
    selector: "app-player-connecting",
    standalone: true,
    imports: [PlayerStatusScreenComponent],
    templateUrl: "./player-connecting.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerConnectingComponent {}
