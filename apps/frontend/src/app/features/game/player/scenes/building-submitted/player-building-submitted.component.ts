import {Component, input, output} from "@angular/core";
import {PlayerStatusScreenComponent} from '../player-status-screen.component';

@Component({
    selector: "app-player-building-submitted",
    standalone: true,
    imports: [PlayerStatusScreenComponent],
    templateUrl: "./player-building-submitted.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerBuildingSubmittedComponent {
    public readonly allPlayersDone = input<boolean>(false);
    public readonly endRoundEarly = output<void>();
}