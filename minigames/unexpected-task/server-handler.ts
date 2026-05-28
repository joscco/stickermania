import type {
  BaseMinigameTask,
  MinigameClientAction,
  MinigameHandler,
  MinigamePlayerResult,
  OpenMinigameSubmission,
  RoundVoteResult,
} from "@birthday/shared";
import {UnexpectedTaskGame} from "./game.js";
import type {
  UnexpectedTaskAnswerOption,
  UnexpectedTaskComparison,
  UnexpectedTaskPlayerResult,
  UnexpectedTaskVariantData,
} from "./game.js";
import {UNEXPECTED_TASK_VARIANTS} from "./variants.js";

type UnexpectedTaskPhase = "answer" | "rate";

type UnexpectedTaskTask = BaseMinigameTask & {
  type: "unexpected-task";
  phase: UnexpectedTaskPhase;
  variantData: UnexpectedTaskVariantData;
  answerOptions?: UnexpectedTaskAnswerOption[];
  comparisonsByPlayerId?: Record<string, UnexpectedTaskComparison>;
};

type UnexpectedTaskPayload = {
  answer?: unknown;
  selectedAnswerId?: unknown;
};

type UnexpectedTaskOpenSubmission = OpenMinigameSubmission & {
  minigameType: "unexpected-task";
  payload:
    | {
        phase: "answer";
        answer: string;
      }
    | {
        phase: "rate";
        selectedAnswerId: string;
      };
};

export class UnexpectedTaskHandler
  implements MinigameHandler<UnexpectedTaskTask, UnexpectedTaskOpenSubmission>
{
  public readonly type = "unexpected-task";

  public createTasks(): UnexpectedTaskTask[] {
    return UNEXPECTED_TASK_VARIANTS.map((variant) => ({
      id: `${variant.id}:answer`,
      type: this.type,
      title: variant.answerQuestion,
      durationSec: variant.firstRoundSeconds,
      phase: "answer",
      variantData: variant,
    }));
  }

  public createSubmission(args: {
    playerId: string;
    roundIndex: number;
    task: UnexpectedTaskTask;
    action: MinigameClientAction;
    now: number;
  }): UnexpectedTaskOpenSubmission | null {
    if (args.action.type !== "submit-minigame" || args.action.minigameType !== this.type) {
      return null;
    }

    const payload = (typeof args.action.payload === "object" && args.action.payload !== null
      ? args.action.payload
      : {}) as UnexpectedTaskPayload;

    if (args.task.phase === "answer") {
      const answer = String(payload.answer ?? "").trim().slice(0, 80);
      if (answer.length === 0) return null;

      return {
        minigameType: this.type,
        playerId: args.playerId,
        roundIndex: args.roundIndex,
        submittedAt: args.now,
        payload: {phase: "answer", answer},
      };
    }

    const comparison = args.task.comparisonsByPlayerId?.[args.playerId];
    const selectedAnswerId = String(payload.selectedAnswerId ?? "");
    if (
      !comparison ||
      (selectedAnswerId !== comparison.left.id && selectedAnswerId !== comparison.right.id)
    ) {
      return null;
    }

    return {
      minigameType: this.type,
      playerId: args.playerId,
      roundIndex: args.roundIndex,
      submittedAt: args.now,
      payload: {phase: "rate", selectedAnswerId},
    };
  }

  public evaluateSubmissions(args: {
    task: UnexpectedTaskTask;
    submissions: UnexpectedTaskOpenSubmission[];
  }) {
    if (args.task.phase === "answer") {
      const answerSubmissions = args.submissions.filter(
        (submission) => submission.payload.phase === "answer",
      );
      if (answerSubmissions.length !== 1) {
        return {
          result: {resultsByPlayerId: {}},
          voteResults: [],
          winnerId: null,
          tiedWinnerIds: [],
        };
      }

      const answerSubmission = answerSubmissions[0]!;
      const result: UnexpectedTaskPlayerResult = {
        playerId: answerSubmission.playerId,
        placement: 1,
        answer: answerSubmission.payload.phase === "answer" ? answerSubmission.payload.answer : "",
        ratingCount: 0,
      };

      return {
        result: {resultsByPlayerId: {[answerSubmission.playerId]: result}},
        voteResults: [{
          submissionId: `minigame_${answerSubmission.playerId}_${answerSubmission.roundIndex}`,
          playerId: answerSubmission.playerId,
          voteCount: 0,
          placement: 1,
          result,
        }],
        winnerId: answerSubmission.playerId,
        tiedWinnerIds: [],
      };
    }

    const answerOptions = args.task.answerOptions ?? [];
    const game = new UnexpectedTaskGame(
      args.task.variantData,
      answerOptions,
    );
    const result = game.calculateResults(
      args.submissions.map((submission) => ({
        playerId: submission.playerId,
        phase: "rate",
        selectedAnswerId:
          submission.payload.phase === "rate" ? submission.payload.selectedAnswerId : "",
      })),
    );

    const voteResults: RoundVoteResult[] = Object.values(result.resultsByPlayerId)
      .sort(
        (a, b) =>
          a.placement - b.placement ||
          b.ratingCount - a.ratingCount ||
          a.playerId.localeCompare(b.playerId),
      )
      .map((entry) => ({
        submissionId: `minigame_${entry.playerId}_${args.submissions.find((s) => s.playerId === entry.playerId)?.roundIndex ?? 0}`,
        playerId: entry.playerId,
        voteCount: entry.ratingCount,
        placement: entry.placement,
        result: entry,
      }));

    const firstPlace = voteResults.filter((voteResult) => voteResult.placement === 1);
    return {
      result,
      voteResults,
      winnerId: firstPlace[0]?.playerId ?? null,
      tiedWinnerIds: firstPlace.slice(1).map((voteResult) => voteResult.playerId),
    };
  }

  public createNextTaskAfterResults(args: {
    task: UnexpectedTaskTask;
    submissions: UnexpectedTaskOpenSubmission[];
    nextRoundIndex: number;
  }): UnexpectedTaskTask | null {
    if (args.task.phase !== "answer") return null;

    const answerOptions = buildAnswerOptions(
      args.submissions,
      args.task.variantData,
      args.nextRoundIndex,
    );

    const playerAnswerOptions = answerOptions.filter((answerOption) => answerOption.isPlayerAnswer);
    if (playerAnswerOptions.length < 2) return null;

    return {
      id: `${args.task.variantData.id}:rate:${args.nextRoundIndex}`,
      type: this.type,
      title: args.task.variantData.ratingQuestion,
      durationSec: args.task.variantData.secondRoundSeconds,
      phase: "rate",
      variantData: args.task.variantData,
      answerOptions,
      comparisonsByPlayerId: Object.fromEntries(
        answerOptions
          .filter((answerOption) => answerOption.isPlayerAnswer && answerOption.playerId !== null)
          .map((answerOption) => [
            answerOption.playerId,
            pickComparisonForPlayer(answerOption.playerId ?? "", answerOptions, args.nextRoundIndex),
          ]),
      ),
    };
  }

  public getResultSummary(args: {
    task: UnexpectedTaskTask;
    submission: UnexpectedTaskOpenSubmission | undefined;
    result: MinigamePlayerResult | undefined;
  }): string {
    if (args.task.phase === "answer") {
      return args.submission?.payload.phase === "answer"
        ? `Antwort gespeichert: ${args.submission.payload.answer}`
        : "";
    }

    const result = args.result as UnexpectedTaskPlayerResult | undefined;
    if (!result) return "";
    return `${result.answer}: ${result.ratingCount} Bewertung${result.ratingCount === 1 ? "" : "en"}.`;
  }
}

function pickComparisonForPlayer(
  playerId: string,
  answerOptions: UnexpectedTaskAnswerOption[],
  nextRoundIndex: number,
): UnexpectedTaskComparison {
  const opponents = answerOptions.filter((answerOption) => answerOption.playerId !== playerId);
  const candidates = opponents.length >= 2 ? opponents : answerOptions;
  const firstIndex = stableIndex(`${playerId}:${nextRoundIndex}`, candidates.length);
  const secondIndex = (firstIndex + 1) % candidates.length;

  return {
    left: candidates[firstIndex]!,
    right: candidates[secondIndex]!,
  };
}

function buildAnswerOptions(
  submissions: UnexpectedTaskOpenSubmission[],
  variant: UnexpectedTaskVariantData,
  nextRoundIndex: number,
): UnexpectedTaskAnswerOption[] {
  const playerAnswerOptions = submissions
    .filter((submission) => submission.payload.phase === "answer")
    .map((submission) => ({
      id: `${submission.playerId}:${nextRoundIndex}`,
      playerId: submission.playerId,
      answer: submission.payload.phase === "answer" ? submission.payload.answer : "",
      isPlayerAnswer: true,
    }))
    .filter((answerOption) => answerOption.answer.length > 0)
    .sort((a, b) => a.playerId.localeCompare(b.playerId));

  const usedAnswers = new Set(playerAnswerOptions.map((answerOption) => normalizeAnswer(answerOption.answer)));
  const minimumOptions = playerAnswerOptions.length > 0 ? Math.max(3, playerAnswerOptions.length) : 0;
  const sampleAnswerOptions: UnexpectedTaskAnswerOption[] = [];

  for (const sampleAnswer of variant.sampleAnswers) {
    if (playerAnswerOptions.length + sampleAnswerOptions.length >= minimumOptions) break;
    const normalized = normalizeAnswer(sampleAnswer);
    if (usedAnswers.has(normalized)) continue;

    usedAnswers.add(normalized);
    sampleAnswerOptions.push({
      id: `sample:${variant.id}:${sampleAnswerOptions.length}`,
      playerId: null,
      answer: sampleAnswer,
      isPlayerAnswer: false,
    });
  }

  return [...playerAnswerOptions, ...sampleAnswerOptions];
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLocaleLowerCase();
}

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % Math.max(1, length);
}
