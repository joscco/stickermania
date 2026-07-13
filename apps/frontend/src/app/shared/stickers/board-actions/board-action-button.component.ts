import {Component, input, output} from "@angular/core";
import {SvgComponent} from "../../ui/svg/svg.component";

export type BoardActionButtonKind = "export" | "reset";
export type BoardActionButtonState = "idle" | "loading" | "done" | "error";

@Component({
  selector: "app-board-action-button",
  standalone: true,
  imports: [SvgComponent],
  templateUrl: "./board-action-button.component.html",
})
export class BoardActionButtonComponent {
  readonly kind = input.required<BoardActionButtonKind>();
  readonly state = input<BoardActionButtonState>("idle");
  readonly actionRequested = output<Event>();

  title(): string {
    const kind = this.kind();
    const state = this.state();
    if (kind === "reset") {
      if (state === "loading") return "Board wird geleert";
      if (state === "done") return "Board geleert";
      if (state === "error") return "Reset fehlgeschlagen";
      return "Board leeren";
    }

    if (state === "loading") return "Board wird exportiert";
    if (state === "done") return "Board exportiert";
    if (state === "error") return "Export fehlgeschlagen";
    return "Board exportieren";
  }

  iconName(): string {
    const state = this.state();
    if (state === "loading") return "icon-wait";
    if (state === "done") return "icon-checkmark";
    if (state === "error") return "icon-cross";
    return this.kind() === "reset" ? "icon-reset" : "icon-download";
  }
}
