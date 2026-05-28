import {Component, input, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {NumberSubmission, NumberTask} from "@birthday/shared";

@Component({
  selector: "app-number-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./number-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class NumberResultComponent {
  readonly submission = input.required<NumberSubmission>();
  readonly task = input.required<NumberTask>();
  readonly allSubmissions = input<NumberSubmission[]>([]);
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);

  readonly average = computed(() => {
    const vals = this.allSubmissions().map(s => s.value);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  });

  readonly deviation = computed(() =>
    Math.abs(this.submission().value - this.average())
  );
}
