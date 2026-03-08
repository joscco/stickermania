import { Component, input } from "@angular/core";
import type { SessionPlayer } from "@birthday/shared";

@Component({
  selector: "app-idle-waiting",
  standalone: true,
  templateUrl: './idle-waiting.component.html',
})
export class IdleWaitingComponent {
  public readonly myScore = input.required<number>();
  public readonly leaderboard = input.required<SessionPlayer[]>();
}
