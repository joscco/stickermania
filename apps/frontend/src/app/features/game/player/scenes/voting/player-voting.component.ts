import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PromptBannerComponent} from '../../../../shared/prompt-banner/prompt-banner.component';
import {StickerVotingComponent} from './voting/sticker-voting.component';
import {PlayerVotingDoneComponent} from './player-voting-done.component';
import type {VotingViewModel} from '../../player-view-models';

@Component({
    selector: "app-player-voting",
    standalone: true,
    imports: [CommonModule, StickerVotingComponent, AnimOnInitDirective, PlayerVotingDoneComponent, PromptBannerComponent],
    templateUrl: "./player-voting.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingComponent {
    public readonly vm = input.required<VotingViewModel>();

    public readonly castVote = output<string>();
    public readonly doneVoting = output<void>();
    public readonly endVotingEarly = output<void>();
}