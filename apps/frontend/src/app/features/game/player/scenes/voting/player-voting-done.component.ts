import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer} from "@birthday/shared";
import {PlayerStatusScreenComponent} from '../player-status-screen.component';
import {BoardPlayerAvatarComponent} from '../../../board/player-avatar/board-player-avatar.component';

@Component({
    selector: "app-player-voting-done",
    standalone: true,
    imports: [CommonModule, PlayerStatusScreenComponent, BoardPlayerAvatarComponent],
    templateUrl: "./player-voting-done.component.html",
    host: {class: "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingDoneComponent {
    public readonly allVotingDone = input<boolean>(false);
    public readonly players = input<Record<string, SessionPlayer>>({});
    public readonly roundParticipantIds = input<string[]>([]);
    public readonly doneVotingIds = input<string[]>([]);
    public readonly endVotingEarly = output<void>();
}