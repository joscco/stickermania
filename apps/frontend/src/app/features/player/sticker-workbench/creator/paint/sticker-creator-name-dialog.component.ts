import {Component, input, output} from "@angular/core";
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";

import {AnimOnInitDirective} from "../../../../../shared/ui/animations/anim-on-init.directive";

@Component({
  selector: "app-sticker-creator-name-dialog",
  standalone: true,
  imports: [AnimOnInitDirective],
  templateUrl: "./sticker-creator-name-dialog.component.html",
})
export class StickerCreatorNameDialogComponent {
  readonly name = input("");
  readonly saving = input(false);

  readonly nameChanged = output<string>();
  readonly backRequested = output<void>();
  readonly submitRequested = output<void>();

  readonly maxNameLength = STICKERMANIA_CONFIG.defaultCatalog.maxStickerNameLength;

  updateName(value: string): void {
    this.nameChanged.emit(value.slice(0, this.maxNameLength));
  }
}
