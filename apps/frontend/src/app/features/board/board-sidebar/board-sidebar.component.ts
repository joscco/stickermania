import { CommonModule } from "@angular/common";
import { Component, input } from "@angular/core";
import type { SessionPlayer } from "@birthday/shared";

@Component({
  selector: "app-board-sidebar",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./board-sidebar.component.html",
})
export class BoardSidebarComponent {
  public readonly sessionCode = input.required<string | null>();
  public readonly playerUrl = input.required<string>();
  public readonly playerQrDataUrl = input.required<string | null>();
  public readonly wifiQrDataUrl = input.required<string | null>();
  public readonly leaderboard = input.required<SessionPlayer[]>();
}

