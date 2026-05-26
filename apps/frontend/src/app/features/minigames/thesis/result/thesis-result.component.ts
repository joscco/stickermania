import {Component, input, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {ThesisSubmission, ThesisTask} from "@birthday/shared";

@Component({
  selector: "app-thesis-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./thesis-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class ThesisResultComponent {
  readonly submission = input.required<ThesisSubmission>();
  readonly task = input.required<ThesisTask>();
  readonly allSubmissions = input<ThesisSubmission[]>([]);
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);

  readonly actualPercent = computed(() => {
    const all = this.allSubmissions();
    if (all.length === 0) return 50;
    const agreed = all.filter(s => s.agreed).length;
    return Math.round((agreed / all.length) * 100);
  });

  readonly deviation = computed(() =>
    Math.abs(this.submission().estimatedPercent - this.actualPercent())
  );
}
