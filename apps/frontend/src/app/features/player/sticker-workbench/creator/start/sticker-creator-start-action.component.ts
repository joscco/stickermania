import {Component, input, output} from "@angular/core";
import {SvgComponent} from '../../../../../shared/ui/svg/svg.component';

export type StickerCreatorStartActionKind = "button" | "file";
export type StickerCreatorStartActionTone = "yellow" | "white" | "cream";

@Component({
  selector: "app-sticker-creator-start-action",
  standalone: true,
  imports: [SvgComponent],
  templateUrl: "./sticker-creator-start-action.component.html",
  host: {
    class: "block h-[clamp(4.1rem,15cqh,5.75rem)]",
  },
})
export class StickerCreatorStartActionComponent {
  readonly kind = input<StickerCreatorStartActionKind>("button");
  readonly tone = input<StickerCreatorStartActionTone>("white");
  readonly icon = input.required<string>();
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly capture = input<string | null>(null);
  readonly invisible = input(false);
  readonly disabled = input(false);

  readonly activated = output<void>();
  readonly fileSelected = output<File | null>();

  onFileInputClick(event: MouseEvent): void {
    if (this.disabled() || this.invisible()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.stopPropagation();
    this.activated.emit();
  }

  onFileInputChange(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = "";
    this.fileSelected.emit(file);
  }
}
