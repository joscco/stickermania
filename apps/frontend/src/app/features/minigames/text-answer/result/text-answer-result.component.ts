import {Component, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {TextAnswerSubmission, TextAnswerTask} from "@birthday/shared";

@Component({
  selector: "app-text-answer-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./text-answer-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class TextAnswerResultComponent {
  readonly submission = input.required<TextAnswerSubmission>();
  readonly task = input.required<TextAnswerTask>();
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);
}
