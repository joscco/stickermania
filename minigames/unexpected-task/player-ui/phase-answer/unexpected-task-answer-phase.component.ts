import {CommonModule} from "@angular/common";
import {Component, computed, input, output} from "@angular/core";
import {
  UnexpectedTaskDraft,
  UnexpectedTaskPlayerUiEvent,
  UnexpectedTaskPlayerUiState,
} from "../ui-contract";

@Component({
  selector: "sm-unexpected-task-answer-phase",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./unexpected-task-answer-phase.component.html",
})
export class UnexpectedTaskAnswerPhaseComponent {
  public readonly state = input.required<UnexpectedTaskPlayerUiState>();
  public readonly playerEvent = output<UnexpectedTaskPlayerUiEvent>();

  public readonly draft = computed<UnexpectedTaskDraft>(() => ({
    answer: this.state().draft?.answer ?? "",
    selectedAnswerId: this.state().draft?.selectedAnswerId ?? null,
  }));

  public setAnswer(event: Event): void {
    this.playerEvent.emit({
      type: "draft-change",
      playerId: this.state().playerId,
      draft: {
        ...this.draft(),
        answer: (event.target as HTMLTextAreaElement).value,
      },
    });
  }
}
