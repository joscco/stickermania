import {
  Minigame,
  MinigamePlayerResult,
  MinigameResult,
  MinigameSubmission,
  MinigameVariantData,
} from "../../packages/shared/src/minigame.js";

export interface EstimateOpinionsVariantData extends MinigameVariantData {
  id: string;
  title: string;
  firstRoundSeconds: number;
  question: string;
  optionA: string;
  optionB: string;
}

export interface EstimateOpinionsSubmission extends MinigameSubmission {
  playerId: string;
  choseOptionA: boolean;
  estimatedPercentageWithSameOpinion: number;
}

export interface EstimateOpinionsPlayerResult extends MinigamePlayerResult {
  playerId: string;
  placement: number;
  chosenOption: string;
  choseOptionA: boolean;
  estimatedPercentageWithSameOpinion: number;
  realPercentageWithSameOpinion: number;
  deviationPercentagePoints: number;
}

export class EstimateOpinionsGame implements Minigame<
  EstimateOpinionsVariantData,
  EstimateOpinionsSubmission,
  EstimateOpinionsPlayerResult
> {
  public constructor(private readonly variantData: EstimateOpinionsVariantData) {}

  public provideData(): EstimateOpinionsVariantData {
    return this.variantData;
  }

  public calculateResults(
    submissions: EstimateOpinionsSubmission[],
  ): MinigameResult<EstimateOpinionsPlayerResult> {
    if (submissions.length === 0) {
      return {resultsByPlayerId: {}};
    }

    const playersTotal = submissions.length;
    const playersWithOptionA = submissions.filter((submission) => submission.choseOptionA).length;
    const percentageWithOptionA = playersWithOptionA / playersTotal;

    const rankedPlayers = submissions
      .map((submission) => {
        const realPercentageWithSameOpinion = submission.choseOptionA
          ? percentageWithOptionA
          : 1 - percentageWithOptionA;
        const estimatedPercentageWithSameOpinion = clampPercentage(
          submission.estimatedPercentageWithSameOpinion,
        );

        return {
          playerId: submission.playerId,
          chosenOption: submission.choseOptionA
            ? this.variantData.optionA
            : this.variantData.optionB,
          choseOptionA: submission.choseOptionA,
          estimatedPercentageWithSameOpinion,
          realPercentageWithSameOpinion,
          deviationPercentagePoints: Math.abs(
            estimatedPercentageWithSameOpinion - realPercentageWithSameOpinion,
          ) * 100,
        };
      })
      .sort(
        (a, b) =>
          a.deviationPercentagePoints - b.deviationPercentagePoints ||
          a.playerId.localeCompare(b.playerId),
      );

    const resultsByPlayerId: Record<string, EstimateOpinionsPlayerResult> = {};
    let previousDeviation: number | null = null;
    let previousPlacement = 0;

    rankedPlayers.forEach((player, index) => {
      const placement =
        previousDeviation === player.deviationPercentagePoints
          ? previousPlacement
          : index + 1;

      resultsByPlayerId[player.playerId] = {
        ...player,
        placement,
      };

      previousDeviation = player.deviationPercentagePoints;
      previousPlacement = placement;
    });

    return {resultsByPlayerId};
  }
}

export function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
