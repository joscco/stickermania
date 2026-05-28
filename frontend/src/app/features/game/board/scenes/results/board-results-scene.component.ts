import {CommonModule} from "@angular/common";
import {Component, computed, input, output} from "@angular/core";
import type {
  SessionPlayer,
  PartyGameState,
  PartyResultsState,
  RoundVoteResult,
} from "@birthday/shared";
import {AnimOnInitDirective} from "../../../../shared/animations/anim-on-init.directive";
import {BoardPlayerAvatarComponent} from "../../player-avatar/board-player-avatar.component";
import {RoundInfoComponent} from "../../../../shared/round-info/round-info.component";

@Component({
  selector: "app-board-results-scene",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, BoardPlayerAvatarComponent, RoundInfoComponent],
  templateUrl: "./board-results-scene.component.html",
})
export class BoardResultsSceneComponent {
  public readonly gameState = input<PartyGameState | null>(null);
  public readonly players = input<Record<string, SessionPlayer>>({});
  public readonly advanceFromResults = output<void>();

  private readonly resultsState = computed<PartyResultsState | null>(() => {
    const phaseState = this.gameState()?.phaseState;
    return phaseState?.phase === "RESULTS" ? phaseState : null;
  });

  public readonly results = computed<RoundVoteResult[]>(() =>
    [...(this.resultsState()?.lastVoteResults ?? [])].sort(
      (a, b) => a.placement - b.placement || a.playerId.localeCompare(b.playerId),
    ),
  );

  public readonly winnerId = computed(() => this.resultsState()?.winnerId ?? null);
  public readonly readyToAdvanceCount = computed(() => this.resultsState()?.readyToAdvanceIds.length ?? 0);
  public readonly currentTask = computed(() => this.gameState()?.currentTask ?? null);

  public getPlayer(playerId: string): SessionPlayer | undefined {
    return this.players()[playerId];
  }

  public resultDetail(result: RoundVoteResult): string {
    const detail = result.result as {stoppedAtSeconds?: number; deviationSeconds?: number} | undefined;
    if (typeof detail?.stoppedAtSeconds === "number" && typeof detail.deviationSeconds === "number") {
      return `${detail.stoppedAtSeconds.toFixed(2)}s · ${detail.deviationSeconds.toFixed(2)}s daneben`;
    }

    return `${result.voteCount} Stimmen`;
  }
}
