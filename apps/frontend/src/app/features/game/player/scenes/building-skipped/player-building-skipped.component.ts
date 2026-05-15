import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer} from "@birthday/shared";
import {PlayerStatusScreenComponent} from '../player-status-screen.component';
import {BoardPlayerAvatarComponent} from '../../../board/player-avatar/board-player-avatar.component';

@Component({
    selector: "app-player-building-skipped",
    standalone: true,
    imports: [CommonModule, PlayerStatusScreenComponent, BoardPlayerAvatarComponent],
    templateUrl: "./player-building-skipped.component.html",
    host: {"class": "flex-1 flex flex-col"},
})
export class PlayerBuildingSkippedComponent {
    public readonly allPlayersDone = input<boolean>(false);
    public readonly players = input<Record<string, SessionPlayer>>({});
    public readonly roundParticipantIds = input<string[]>([]);
    public readonly submittedPlayerIds = input<Set<string>>(new Set());
    public readonly endRoundEarly = output<void>();
}