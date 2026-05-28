import {CommonModule} from "@angular/common";
import {Component, computed, input, output} from "@angular/core";
import {
  EstimateOpinionsDraft,
  EstimateOpinionsPlayerUiEvent,
  EstimateOpinionsPlayerUiState,
} from "../ui-contract";
import {BigPercentageSliderComponent} from "../../../_shared/big-percentage-slider/big-percentage-slider.component";

@Component({
  selector: "sm-estimate-opinions-phase",
  standalone: true,
  imports: [CommonModule, BigPercentageSliderComponent],
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

  public setEstimatedPercentageWithSameOpinion(estimatedPercentageWithSameOpinion: number): void {
    this.emitDraft({
      ...this.draft(),
      estimatedPercentageWithSameOpinion,
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