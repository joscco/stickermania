import {Component, input, output, signal} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {TextAnswerSubmission} from "@birthday/shared";

@Component({
  selector: "app-text-answer-voting",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./text-answer-voting.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square flex flex-col bg-white rounded-2xl shadow-md border border-neutral-200 overflow-hidden"},
})
export class TextAnswerVotingComponent {
  readonly answers = input.required<Array<{submission: TextAnswerSubmission; playerName: string}>>();
  readonly voteSelected = output<string>();
  readonly selectedId = signal<string | null>(null);

  select(playerId: string) {
    this.selectedId.set(playerId);
    this.voteSelected.emit(playerId);
  }
}
