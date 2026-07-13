import {Component, input, output} from "@angular/core";
import {SvgComponent} from '../../../../../shared/ui/svg/svg.component';

@Component({
  selector: "app-sticker-creator-paint-tool-button",
  standalone: true,
  imports: [SvgComponent],
  templateUrl: "./sticker-creator-paint-tool-button.component.html",
})
export class StickerCreatorPaintToolButtonComponent {
  readonly active = input(false);
  readonly activeBackground = input<string | null>(null);
  readonly activeForeground = input<string | null>(null);
  readonly activeBorder = input(false);
  readonly icon = input<string | null>(null);
  readonly title = input.required<string>();

  readonly selected = output<void>();
}
