import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPack} from "@birthday/shared";
import type {WinnerStep} from '../../player-view-models';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {PromptBannerComponent} from '../../../../shared/prompt-banner/prompt-banner.component';
import {PlayerStatusScreenComponent} from '../player-status-screen.component';
import {PlacementBadgeComponent} from '../../../shared/placement-badge.component';
import {PlayerWinnerChoicesComponent} from '../winner-choices/player-winner-choices.component';

@Component({
    selector: "app-player-results",
    standalone: true,
  imports: [CommonModule, AnimOnInitDirective, PlayerStatusScreenComponent, PromptBannerComponent, PlacementBadgeComponent, PlayerWinnerChoicesComponent],
    templateUrl: "./player-results.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerResultsComponent {
    public readonly myPlacement = input<number | null>(null);
    public readonly myVoteCount = input<number>(0);
    public readonly isWinner = input<boolean>(false);
    public readonly isTiedWinner = input<boolean>(false);
    public readonly winnerChoicesDone = input<boolean>(false);
    public readonly currentWinnerStep = input<WinnerStep>(null);
    public readonly hasChosenPrompt = input<boolean>(false);
    public readonly hasLockedPacks = input<boolean>(false);
    public readonly hasUnlockedPack = input<boolean>(false);
    public readonly promptChoices = input<string[]>([]);
    public readonly packUnlockChoices = input<StickerPack[]>([]);
    public readonly winnerId = input<string | null>(null);
    public readonly winnerName = input<string>('');
    public readonly canReadyToAdvance = input<boolean>(false);

    public readonly pickPrompt = output<string>();
    public readonly unlockPack = output<string>();
    public readonly readyToAdvance = output<void>();
}
