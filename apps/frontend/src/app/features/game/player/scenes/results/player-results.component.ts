import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import {WorldStore} from '../../../../../core/world.store';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/svg/svg.component';

@Component({
    selector: "app-player-results",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective, SvgComponent],
    templateUrl: "./player-results.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerResultsComponent {
    public readonly stickerService = inject(StickerPlayerService);
    public readonly worldStore = inject(WorldStore);

    public readonly currentWinnerStep = computed<"prompt" | "unlock" | "guaranteed" | null>(() => {
      const isWinner = this.stickerService.isWinner() && !this.stickerService.winnerChoicesDone();
      if (!isWinner) return null;

      if (!this.stickerService.hasChosenPrompt() && this.stickerService.promptChoices().length > 0) {
        return "prompt";
      }
      if (
        this.stickerService.hasChosenPrompt()
        && !this.stickerService.hasUnlockedPack()
        && this.stickerService.packUnlockChoices().length > 0
      ) {
        return "unlock";
      }
      if (
        this.stickerService.hasChosenPrompt()
        && (this.stickerService.hasUnlockedPack() || !this.stickerService.hasLockedPacks())
        && this.stickerService.guaranteedPackChoices().length > 0
      ) {
        return "guaranteed";
      }
      return null;
    });
}
