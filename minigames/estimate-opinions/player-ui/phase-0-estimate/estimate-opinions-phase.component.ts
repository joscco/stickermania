import {CommonModule} from "@angular/common";
import {Component, computed, input, output} from "@angular/core";
import {
  EstimateOpinionsDraft,
  EstimateOpinionsPlayerUiEvent,
  EstimateOpinionsPlayerUiState,
} from "../ui-contract";

@Component({
  selector: "sm-estimate-opinions-phase",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./estimate-opinions-phase.component.html",
})
export class EstimateOpinionsPhaseComponent {
  public readonly state = input.required<EstimateOpinionsPlayerUiState>();
  public readonly playerEvent = output<EstimateOpinionsPlayerUiEvent>();

  public readonly draft = computed<EstimateOpinionsDraft>(() => ({
    choseOptionA: this.state().draft?.choseOptionA ?? null,
    estimatedPercentageWithSameOpinion:
      this.state().draft?.estimatedPercentageWithSameOpinion ?? 0.5,
  }));

  public chooseOption(choseOptionA: boolean): void {
    this.emitDraft({
      ...this.draft(),
      choseOptionA,
    });
  }

  public setEstimate(event: Event): void {
    const percentage = Number((event.target as HTMLInputElement).value) / 100;
    if (!Number.isFinite(percentage)) return;

    this.emitDraft({
      ...this.draft(),
      estimatedPercentageWithSameOpinion: Math.min(1, Math.max(0, percentage)),
    });
  }

  private emitDraft(draft: EstimateOpinionsDraft): void {
    this.playerEvent.emit({
      type: "draft-change",
      playerId: this.state().playerId,
      draft,
    });
  }
}
