import {Component, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {ShapeSplitSubmission, ShapeSplitTask} from "@birthday/shared";

@Component({
  selector: "app-shape-split-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./shape-split-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class ShapeSplitResultComponent {
  readonly submission = input.required<ShapeSplitSubmission>();
  readonly task = input.required<ShapeSplitTask>();
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);
}
