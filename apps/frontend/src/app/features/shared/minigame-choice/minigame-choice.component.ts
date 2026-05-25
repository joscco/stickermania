import {Component, input, output, signal} from "@angular/core";
import {CommonModule} from "@angular/common";

@Component({
  selector: "app-minigame-choice",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./minigame-choice.component.html",
  host: {"class": "flex-1 flex flex-col items-center justify-center gap-4 p-4"},
})
export class MinigameChoiceComponent {
  readonly options = input.required<Array<{label: string; emoji?: string}>>();
  readonly allowMultiple = input(false);
  readonly selected = signal<number[]>([]);
  readonly submitted = output<number[]>();

  toggle(index: number): void {
    const current = this.selected();
    if (this.allowMultiple()) {
      if (current.includes(index)) {
        this.selected.set(current.filter(i => i !== index));
      } else {
        this.selected.set([...current, index]);
      }
    } else {
      this.selected.set([index]);
    }
  }

  submit(): void {
    if (this.selected().length > 0) {
      this.submitted.emit(this.selected());
    }
  }
}
