import {Component, input, output} from "@angular/core";
import {PlayerStatusScreenComponent} from '../player-status-screen.component';

@Component({
    selector: "app-player-building-skipped",
    standalone: true,
    imports: [PlayerStatusScreenComponent],
    templateUrl: "./player-building-skipped.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerBuildingSkippedComponent {
    public readonly allPlayersDone = input<boolean>(false);
    public readonly endRoundEarly = output<void>();
}