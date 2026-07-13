import {Component, input, output} from "@angular/core";
import {AnimOnInitDirective} from '../../../../shared/ui/animations/anim-on-init.directive';
import {SvgComponent} from '../../../../shared/ui/svg/svg.component';
import {BoardActionButtonComponent, type BoardActionButtonState} from '../../../../shared/stickers/board-actions/board-action-button.component';

export type PlayerStickerBoardMode = "view" | "edit";

@Component({
  selector: "app-player-board-controls",
  standalone: true,
  imports: [AnimOnInitDirective, SvgComponent, BoardActionButtonComponent],
  templateUrl: "./player-board-controls.component.html",
})
export class PlayerBoardControlsComponent {
  readonly boardMode = input.required<PlayerStickerBoardMode>();
  readonly canEditBoard = input(false);
  readonly showBoardPicker = input(false);
  readonly showPlacementAuthorControls = input(true);
  readonly showPlacementAuthors = input(false);
  readonly showBoardActions = input(false);
  readonly boardExportState = input<BoardActionButtonState>("idle");
  readonly boardResetState = input<BoardActionButtonState>("idle");

  readonly modeSelected = output<PlayerStickerBoardMode>();
  readonly placementAuthorsVisibleChanged = output<boolean>();
  readonly pickerRequested = output<void>();
  readonly exportBoardRequested = output<Event>();
  readonly resetBoardRequested = output<Event>();
}
