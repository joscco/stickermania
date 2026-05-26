import {Component, input, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import {minigameRegistry} from "@birthday/shared";
import type {MinigameTask, MinigameSubmission} from "@birthday/shared";

@Component({
  selector: "app-minigame-result-card",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./minigame-result-card.component.html",
  host: {"class": "block"},
})
export class MinigameResultCardComponent {
  readonly task = input.required<MinigameTask>();
  readonly submission = input.required<MinigameSubmission>();
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);
  readonly playerName = input("");

  readonly snapshotUrl = computed(() => {
    const h = minigameRegistry.getHandlerForTask(this.task());
    return h?.getSnapshotSvg(this.submission() as any) ?? null;
  });

  readonly resultText = computed(() => {
    const h = minigameRegistry.getHandlerForTask(this.task());
    return h?.getResultSummary(this.submission() as any, [this.submission()] as any, this.task() as any) ?? "";
  });
}
