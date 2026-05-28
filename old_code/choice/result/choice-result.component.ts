import {Component, input, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {ChoiceSubmission, ChoiceTask} from "@birthday/shared";

@Component({
  selector: "app-choice-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./choice-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class ChoiceResultComponent {
  readonly submission = input.required<ChoiceSubmission>();
  readonly task = input.required<ChoiceTask>();
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);

  readonly selectedLabels = computed(() =>
    this.submission().selectedIndices.map(i => this.task().options[i]?.label ?? `Option ${i + 1}`)
  );

  readonly bestLabel = computed(() => {
    const best = this.selectedLabels();
    return best.length > 0 ? best.join(", ") : "Keine Auswahl";
  });
}
