import {Component, input, output} from "@angular/core";
import {PlayerStatusScreenComponent} from '../player-status-screen.component';

@Component({
    selector: "app-player-voting-done",
    standalone: true,
    imports: [PlayerStatusScreenComponent],
    templateUrl: "./player-voting-done.component.html",
    host: {class: "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingDoneComponent {
    public readonly allVotingDone = input<boolean>(false);
    public readonly endVotingEarly = output<void>();
}