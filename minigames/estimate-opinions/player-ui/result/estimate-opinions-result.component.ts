import {CommonModule} from "@angular/common";
import {Component, input} from "@angular/core";
import {EstimateOpinionsPlayerUiState} from "../ui-contract";

@Component({
  selector: "sm-estimate-opinions-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./estimate-opinions-result.component.html",
})
export class EstimateOpinionsResultComponent {
  public readonly state = input.required<EstimateOpinionsPlayerUiState>();
}
