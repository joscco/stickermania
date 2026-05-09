import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollage, StickerDefinition, SessionPlayer} from "@birthday/shared";
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {StickerVotingComponent} from './voting/sticker-voting.component';
import {PlayerVotingDoneComponent} from './player-voting-done.component';

@Component({
    selector: "app-player-voting",
    standalone: true,
    imports: [CommonModule, StickerVotingComponent, AnimOnInitDirective, PlayerVotingDoneComponent],
    templateUrl: "./player-voting.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerVotingComponent {
    public readonly prompt = input<string>('');
    public readonly submissions = input<StickerCollage[]>([]);
    public readonly stickerCatalog = input<StickerDefinition[]>([]);
    public readonly myVotes = input<string[]>([]);
    public readonly votesRemaining = input<number>(0);
    public readonly players = input<Record<string, SessionPlayer>>({});
    public readonly myPlayerId = input<string>('');
    public readonly myDoneVoting = input<boolean>(false);
    public readonly allVotingDone = input<boolean>(false);

    public readonly castVote = output<string>();
    public readonly doneVoting = output<void>();
    public readonly endVotingEarly = output<void>();
}