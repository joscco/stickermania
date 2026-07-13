import {Component} from "@angular/core";
import {PlayerStatusScreenComponent} from '../player-status-screen.component';

@Component({
    selector: "app-player-disconnected",
    standalone: true,
    imports: [PlayerStatusScreenComponent],
    templateUrl: "./player-disconnected.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerDisconnectedComponent {}
