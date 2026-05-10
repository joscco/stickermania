import {Component, input} from "@angular/core";
import {PlayerStatusScreenComponent} from '../player-status-screen.component';

@Component({
    selector: "app-player-next-round",
    standalone: true,
    imports: [PlayerStatusScreenComponent],
    templateUrl: "./player-next-round.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerNextRoundComponent {
    public readonly hasNewPack = input<boolean>(false);
}