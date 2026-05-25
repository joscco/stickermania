import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {RoundInfoComponent} from '../../../../shared/round-info/round-info.component';
import {MinigameVotingComponent} from './voting/minigame-voting.component';
import {PlayerVotingDoneComponent} from './player-voting-done.component';
import type {VotingViewModel} from '../../player-view-models';

@Component({
    selector: "app-player-voting",
    standalone: true,
    imports: [CommonModule, MinigameVotingComponent, RoundInfoComponent, AnimOnInitDirective, PlayerVotingDoneComponent],
    templateUrl: "./player-voting.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingComponent {
    public readonly vm = input.required<VotingViewModel>();

    public readonly castVote = output<string>();
    public readonly doneVoting = output<void>();
    public readonly endVotingEarly = output<void>();
}