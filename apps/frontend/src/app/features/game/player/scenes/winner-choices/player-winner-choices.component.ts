import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPack} from "@birthday/shared";
import type {WinnerStep} from '../../player-view-models';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';
import {ChoiceButtonComponent} from '../../../shared/choice-button/choice-button.component';

@Component({
    selector: "app-player-winner-choices",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, SvgComponent, ChoiceButtonComponent],
    templateUrl: "./player-winner-choices.component.html",
    host: {"class": "flex-1 flex flex-col overflow-y-auto"},
})
export class PlayerWinnerChoicesComponent {
    public readonly currentWinnerStep = input<WinnerStep>(null);
    public readonly hasChosenPrompt = input<boolean>(false);
    public readonly hasLockedPacks = input<boolean>(false);
    public readonly hasUnlockedPack = input<boolean>(false);
    public readonly promptChoices = input<string[]>([]);
    public readonly packUnlockChoices = input<StickerPack[]>([]);

    public readonly pickPrompt = output<string>();
    public readonly unlockPack = output<string>();
}
