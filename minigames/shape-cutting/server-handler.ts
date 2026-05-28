import type {
  BaseMinigameTask,
  MinigameClientAction,
  MinigameHandler,
  MinigamePlayerResult,
  OpenMinigameSubmission,
  RoundVoteResult,
} from "@birthday/shared";
import {CutLine, Point} from "./geometry.js";
import {ShapeCuttingGame, ShapeCuttingPlayerResult, ShapeCuttingVariantData} from "./game.js";
import {SHAPE_CUTTING_VARIANTS} from "./variants.js";

type ShapeCuttingTask = BaseMinigameTask & {
  type: "shape-cutting";
  variantData: ShapeCuttingVariantData;
};

type ShapeCuttingOpenSubmission = OpenMinigameSubmission & {
  minigameType: "shape-cutting";
  payload: {
    lines: CutLine[];
  };
};

export class ShapeCuttingHandler
  implements MinigameHandler<ShapeCuttingTask, ShapeCuttingOpenSubmission>
{
  public readonly type = "shape-cutting";

  public createTasks(): ShapeCuttingTask[] {
    return SHAPE_CUTTING_VARIANTS.map((variant) => ({
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
    task: ShapeCuttingTask;
    action: MinigameClientAction;
    now: number;
  }): ShapeCuttingOpenSubmission | null {
    if (args.action.type !== "submit-minigame" || args.action.minigameType !== this.type) {
      return null;
    }

    const payload = typeof args.action.payload === "object" && args.action.payload !== null
      ? args.action.payload as {lines?: unknown}
      : {};
    const lines = parseLines(payload.lines);
    const expectedLineCount = Math.max(1, Math.round(args.task.variantData.targetParts) - 1);
    if (!lines || lines.length !== expectedLineCount) return null;

    return {
      minigameType: this.type,
      playerId: args.playerId,
      roundIndex: args.roundIndex,
      submittedAt: args.now,
      payload: {lines},
    };
  }

  public evaluateSubmissions(args: {
    task: ShapeCuttingTask;
    submissions: ShapeCuttingOpenSubmission[];
  }) {
    const submissions = args.submissions.map((submission) => ({
      playerId: submission.playerId,
      lines: submission.payload.lines,
    }));
    const result = new ShapeCuttingGame(args.task.variantData).calculateResults(submissions);

    const voteResults: RoundVoteResult[] = Object.values(result.resultsByPlayerId)
      .sort((a, b) => a.placement - b.placement || a.playerId.localeCompare(b.playerId))
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
    task: ShapeCuttingTask;
    submission: ShapeCuttingOpenSubmission | undefined;
    result: MinigamePlayerResult | undefined;
  }): string {
    const result = args.result as ShapeCuttingPlayerResult | undefined;
    if (!args.submission || !result) return "";

    return `${result.pieceCount}/${result.targetParts} Teile, ${result.deviationPercentagePoints.toFixed(1)} Punkte Abweichung.`;
  }
}

function parseLines(value: unknown): CutLine[] | null {
  if (!Array.isArray(value)) return null;

  const lines = value
    .map((line) => {
      const entry = line as {a?: unknown; b?: unknown};
      if (!isPoint(entry.a) || !isPoint(entry.b)) return null;
      return {a: entry.a, b: entry.b};
    })
    .filter((line): line is CutLine => line !== null);

  return lines.length === value.length
    ? lines.map((line) => ({a: {...line.a}, b: {...line.b}}))
    : null;
}

function isPoint(value: unknown): value is Point {
  const point = value as Partial<Point> | null;
  return !!point &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y);
}
