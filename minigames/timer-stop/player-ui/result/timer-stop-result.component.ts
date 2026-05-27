import {CommonModule} from "@angular/common";
import {Component, input} from "@angular/core";
import {TimerStopPlayerUiState} from "../ui-contract";

@Component({
  selector: "sm-timer-stop-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./timer-stop-result.component.html",
})
export class TimerStopResultComponent {
  public readonly state = input.required<TimerStopPlayerUiState>();
}
