import {
  Minigame,
  MinigamePlayerResult,
  MinigameResult,
  MinigameSubmission,
  MinigameVariantData,
} from "../../packages/shared/src/minigame.js";

export interface TimerStopVariantData extends MinigameVariantData {
  id: string;
  title: string;
  firstRoundSeconds: number;
  targetSeconds: number;
  toleranceSeconds?: number;
}

export interface TimerStopSubmission extends MinigameSubmission {
  playerId: string;
  stoppedAtSeconds: number;
}

export interface TimerStopPlayerResult extends MinigamePlayerResult {
  playerId: string;
  placement: number;
  stoppedAtSeconds: number;
  targetSeconds: number;
  deviationSeconds: number;
}

export class TimerStopGame implements Minigame<
  TimerStopVariantData,
  TimerStopSubmission,
  TimerStopPlayerResult
> {
  public constructor(private readonly variantData: TimerStopVariantData) {}

  public provideData(): TimerStopVariantData {
    return this.variantData;
  }

  public calculateResults(
    submissions: TimerStopSubmission[],
  ): MinigameResult<TimerStopPlayerResult> {
    const rankedPlayers = submissions
      .map((submission) => ({
        playerId: submission.playerId,
        stoppedAtSeconds: submission.stoppedAtSeconds,
        targetSeconds: this.variantData.targetSeconds,
        deviationSeconds: Math.abs(
          submission.stoppedAtSeconds - this.variantData.targetSeconds,
        ),
      }))
      .sort((a, b) => a.deviationSeconds - b.deviationSeconds);

    const resultsByPlayerId: Record<string, TimerStopPlayerResult> = {};
    let previousDeviation: number | null = null;
    let previousPlacement = 0;

    rankedPlayers.forEach((player, index) => {
      const placement =
        previousDeviation === player.deviationSeconds
          ? previousPlacement
          : index + 1;

      resultsByPlayerId[player.playerId] = {
        ...player,
        placement,
      };

      previousDeviation = player.deviationSeconds;
      previousPlacement = placement;
    });

    return {resultsByPlayerId};
  }
}
