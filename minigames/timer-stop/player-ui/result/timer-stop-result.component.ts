import {CommonModule} from "@angular/common";
import {Component, input, output} from "@angular/core";
import {
  TimerStopPlayerUiEvent,
  TimerStopPlayerUiState,
} from "../ui-contract";

@Component({
  selector: "sm-timer-stop-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./timer-stop-result.component.html",
})
export class TimerStopResultComponent {
  public readonly state = input.required<TimerStopPlayerUiState>();
  public readonly playerEvent = output<TimerStopPlayerUiEvent>();

  public ready(): void {
    this.playerEvent.emit({
      type: "ready-for-next",
      playerId: this.state().playerId,
    });
  }
}
