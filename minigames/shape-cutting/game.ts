import {
  Minigame,
  MinigamePlayerResult,
  MinigameResult,
  MinigameSubmission,
  MinigameVariantData,
} from "../../packages/shared/src/minigame.js";
import {CutLine, Point, scoreShapeCut} from "./geometry.js";

export interface ShapeCuttingVariantData extends MinigameVariantData {
  id: string;
  title: string;
  firstRoundSeconds: number;
  backgroundSvg: string | null;
  polygon: Point[];
  targetParts: number;
}

export interface ShapeCuttingSubmission extends MinigameSubmission {
  playerId: string;
  lines: CutLine[];
}

export interface ShapeCuttingPlayerResult extends MinigamePlayerResult {
  playerId: string;
  placement: number;
  deviationPercentagePoints: number;
  pieceCount: number;
  targetParts: number;
  targetFraction: number;
  pieceFractions: number[];
  lines: CutLine[];
}

export class ShapeCuttingGame implements Minigame<
  ShapeCuttingVariantData,
  ShapeCuttingSubmission,
  ShapeCuttingPlayerResult
> {
  public constructor(private readonly variantData: ShapeCuttingVariantData) {}

  public provideData(): ShapeCuttingVariantData {
    return this.variantData;
  }

  public calculateResults(
    submissions: ShapeCuttingSubmission[],
  ): MinigameResult<ShapeCuttingPlayerResult> {
    const rankedPlayers = submissions
      .map((submission) => {
        const score = scoreShapeCut({
          polygon: this.variantData.polygon,
          lines: submission.lines,
          targetParts: this.variantData.targetParts,
        });

        return {
          playerId: submission.playerId,
          deviationPercentagePoints: score.deviationPercentagePoints,
          pieceCount: score.pieceCount,
          targetParts: this.variantData.targetParts,
          targetFraction: score.targetFraction,
          pieceFractions: score.pieces.map((piece) => piece.fraction).sort((a, b) => b - a),
          lines: submission.lines,
        };
      })
      .sort(
        (a, b) =>
          a.deviationPercentagePoints - b.deviationPercentagePoints ||
          a.playerId.localeCompare(b.playerId),
      );

    const resultsByPlayerId: Record<string, ShapeCuttingPlayerResult> = {};
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
