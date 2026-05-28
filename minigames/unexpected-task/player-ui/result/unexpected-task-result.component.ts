import {CommonModule} from "@angular/common";
import {Component, input} from "@angular/core";
import {UnexpectedTaskPlayerUiState} from "../ui-contract";

@Component({
  selector: "sm-unexpected-task-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./unexpected-task-result.component.html",
})
export class UnexpectedTaskResultComponent {
  public readonly state = input.required<UnexpectedTaskPlayerUiState>();
}
