import {Component, input, output, signal} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {MinigameSubmission, MinigameTask} from "@birthday/shared";
import {minigameRegistry} from "@birthday/shared";

interface VoteEntry {
  submission: MinigameSubmission;
  playerName: string;
  snapshotUrl: string | null;
}

@Component({
  selector: "app-drawing-voting",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./drawing-voting.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square flex flex-col bg-white rounded-2xl shadow-md border border-neutral-200 overflow-hidden"},
})
export class DrawingVotingComponent {
  readonly task = input.required<MinigameTask>();
  readonly entries = input.required<VoteEntry[]>();
  readonly voteSelected = output<string>();
  readonly selectedId = signal<string | null>(null);

  select(playerId: string) {
    this.selectedId.set(playerId);
    this.voteSelected.emit(playerId);
  }
}
