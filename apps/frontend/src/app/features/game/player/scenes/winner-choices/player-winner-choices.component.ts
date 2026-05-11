import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPack} from "@birthday/shared";
import type {WinnerStep} from '../../player-view-models';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';

@Component({
    selector: "app-player-winner-choices",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, SvgComponent],
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
    public readonly guaranteedPackChoices = input<StickerPack[]>([]);

    public readonly pickPrompt = output<string>();
    public readonly unlockPack = output<string>();
    public readonly pickGuaranteedPack = output<string>();
}