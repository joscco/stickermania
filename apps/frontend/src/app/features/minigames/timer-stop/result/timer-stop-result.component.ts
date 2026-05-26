import {Component, input, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {TimerStopSubmission, TimerStopTask} from "@birthday/shared";

@Component({
  selector: "app-timer-stop-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./timer-stop-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class TimerStopResultComponent {
  readonly submission = input.required<TimerStopSubmission>();
  readonly task = input.required<TimerStopTask>();
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);

  readonly deviation = computed(() =>
    Math.abs(this.submission().elapsedSec - this.task().targetSec)
  );

  readonly barPct = computed(() => {
    const pct = (this.submission().elapsedSec / (this.task().targetSec * 2)) * 100;
    return Math.min(100, Math.max(0, pct));
  });
}
