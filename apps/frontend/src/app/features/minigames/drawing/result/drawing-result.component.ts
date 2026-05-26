import {Component, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {DrawingSubmission, DrawingTask} from "@birthday/shared";

@Component({
  selector: "app-drawing-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./drawing-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class DrawingResultComponent {
  readonly submission = input.required<DrawingSubmission>();
  readonly task = input.required<DrawingTask>();
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);
}
