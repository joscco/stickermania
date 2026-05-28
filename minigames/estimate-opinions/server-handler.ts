import type {
  BaseMinigameTask,
  MinigameClientAction,
  MinigameHandler,
  MinigamePlayerResult,
  OpenMinigameSubmission,
  RoundVoteResult,
} from "@birthday/shared";
import type {EstimateOpinionsVariantData} from "./game.js";
import {ESTIMATE_OPINIONS_VARIANTS} from "./variants.js";

type EstimateOpinionsPayload = {
  choseOptionA?: unknown;
  estimatedPercentageWithSameOpinion?: unknown;
};

type EstimateOpinionsResult = MinigamePlayerResult & {
  chosenOption: string;
  choseOptionA: boolean;
  estimatedPercentageWithSameOpinion: number;
  realPercentageWithSameOpinion: number;
  deviationPercentagePoints: number;
};

type EstimateOpinionsTask = BaseMinigameTask & {
  type: "estimate-opinions";
  variantData: EstimateOpinionsVariantData;
};

type EstimateOpinionsOpenSubmission = OpenMinigameSubmission & {
  minigameType: "estimate-opinions";
  payload: {
    choseOptionA: boolean;
    estimatedPercentageWithSameOpinion: number;
  };
};

export class EstimateOpinionsHandler
  implements MinigameHandler<EstimateOpinionsTask, EstimateOpinionsOpenSubmission>
{
  public readonly type = "estimate-opinions";

  public createTasks(): EstimateOpinionsTask[] {
    return ESTIMATE_OPINIONS_VARIANTS.map((variant) => ({
      id: variant.id,
      type: this.type,
      title: variant.title,
      durationSec: variant.firstRoundSeconds,
      variantData: variant,
    }));
  }

  public createSubmission(args: {
    playerId: string;
    roundIndex: number;
    task: EstimateOpinionsTask;
    action: MinigameClientAction;
    now: number;
  }): EstimateOpinionsOpenSubmission | null {
    if (args.action.type !== "submit-minigame" || args.action.minigameType !== this.type) {
      return null;
    }

    const payload = (typeof args.action.payload === "object" && args.action.payload !== null
      ? args.action.payload
      : {}) as EstimateOpinionsPayload;

    if (typeof payload.choseOptionA !== "boolean") {
      return null;
    }

    const estimatedPercentageWithSameOpinion = Number(
      payload.estimatedPercentageWithSameOpinion,
    );
    if (!Number.isFinite(estimatedPercentageWithSameOpinion)) {
      return null;
    }

    return {
      minigameType: this.type,
      playerId: args.playerId,
      roundIndex: args.roundIndex,
      submittedAt: args.now,
      payload: {
        choseOptionA: payload.choseOptionA,
        estimatedPercentageWithSameOpinion: clampPercentage(
          estimatedPercentageWithSameOpinion,
        ),
      },
    };
  }

  public evaluateSubmissions(args: {
    task: EstimateOpinionsTask;
    submissions: EstimateOpinionsOpenSubmission[];
  }) {
    const result = calculateResults(args.task, args.submissions);

    const voteResults: RoundVoteResult[] = Object.values(result.resultsByPlayerId)
      .sort(
        (a, b) =>
          a.placement - b.placement ||
          a.deviationPercentagePoints - b.deviationPercentagePoints ||
          a.playerId.localeCompare(b.playerId),
      )
      .map((entry) => ({
        submissionId: `minigame_${entry.playerId}_${args.submissions.find((s) => s.playerId === entry.playerId)?.roundIndex ?? 0}`,
        playerId: entry.playerId,
        voteCount: 0,
        placement: entry.placement,
        result: entry,
      }));

    const firstPlace = voteResults.filter((voteResult) => voteResult.placement === 1);
    const winnerId = firstPlace[0]?.playerId ?? null;
    const tiedWinnerIds = firstPlace.slice(1).map((voteResult) => voteResult.playerId);

    return {
      result,
      voteResults,
      winnerId,
      tiedWinnerIds,
    };
  }

  public getResultSummary(args: {
    task: EstimateOpinionsTask;
    submission: EstimateOpinionsOpenSubmission | undefined;
    result: MinigamePlayerResult | undefined;
  }): string {
    const result = args.result as EstimateOpinionsResult | undefined;
    if (!args.submission || !result) return "";

    return `${result.chosenOption}: ${Math.round(result.estimatedPercentageWithSameOpinion * 100)}% geschaetzt, ${Math.round(result.realPercentageWithSameOpinion * 100)}% tatsaechlich.`;
  }
}

function calculateResults(
  task: EstimateOpinionsTask,
  submissions: EstimateOpinionsOpenSubmission[],
) {
  if (submissions.length === 0) {
    return {resultsByPlayerId: {}};
  }

  const playersWithOptionA = submissions.filter((submission) => submission.payload.choseOptionA).length;
  const percentageWithOptionA = playersWithOptionA / submissions.length;
  const rankedPlayers = submissions
    .map((submission) => {
      const realPercentageWithSameOpinion = submission.payload.choseOptionA
        ? percentageWithOptionA
        : 1 - percentageWithOptionA;
      const estimatedPercentageWithSameOpinion = clampPercentage(
        submission.payload.estimatedPercentageWithSameOpinion,
      );

      return {
        playerId: submission.playerId,
        chosenOption: submission.payload.choseOptionA
          ? task.variantData.optionA
          : task.variantData.optionB,
        choseOptionA: submission.payload.choseOptionA,
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

  const resultsByPlayerId: Record<string, EstimateOpinionsResult> = {};
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

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
