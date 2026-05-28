import type {MinigameTask, OpenMinigameSubmission} from "@birthday/shared";
import type {MinigameFrontendDefinition} from "../frontend-definition";
import {getPayloadObject} from "../frontend-definition";
import {UnexpectedTaskGame} from "./game";
import type {
  UnexpectedTaskAnswerOption,
  UnexpectedTaskComparison,
  UnexpectedTaskPlayerResult,
  UnexpectedTaskSubmission,
  UnexpectedTaskVariantData,
} from "./game";
import {UnexpectedTaskAnswerPhaseComponent} from "./player-ui/phase-answer/unexpected-task-answer-phase.component";
import {UnexpectedTaskRatePhaseComponent} from "./player-ui/phase-rate/unexpected-task-rate-phase.component";
import {UnexpectedTaskResultComponent} from "./player-ui/result/unexpected-task-result.component";
import {UnexpectedTaskDraft} from "./player-ui/ui-contract";
import {UNEXPECTED_TASK_VARIANTS} from "./variants";

type UnexpectedTaskPhase = "answer" | "rate";

type UnexpectedTaskTask = MinigameTask & {
  phase?: UnexpectedTaskPhase;
  variantData?: UnexpectedTaskVariantData;
  answerOptions?: UnexpectedTaskAnswerOption[];
  comparisonsByPlayerId?: Record<string, UnexpectedTaskComparison>;
};

export const UNEXPECTED_TASK_FRONTEND_DEFINITION: MinigameFrontendDefinition<
  UnexpectedTaskVariantData,
  UnexpectedTaskDraft,
  UnexpectedTaskSubmission,
  UnexpectedTaskPlayerResult
> = {
  type: "unexpected-task",
  label: "Unexpected Task",
  phaseComponent: UnexpectedTaskAnswerPhaseComponent,
  phaseComponentForTask: (task) =>
    (task as UnexpectedTaskTask).phase === "rate"
      ? UnexpectedTaskRatePhaseComponent
      : UnexpectedTaskAnswerPhaseComponent,
  resultComponent: UnexpectedTaskResultComponent,
  variants: UNEXPECTED_TASK_VARIANTS,
  taskFromVariant: (variant) => ({
    id: `${variant.id}:answer`,
    type: "unexpected-task",
    title: variant.answerQuestion,
    durationSec: variant.firstRoundSeconds,
    phase: "answer",
    variantData: variant,
  }),
  editorPhaseOptions: ({task, submissions, variant}) => {
    const answerTask = UNEXPECTED_TASK_FRONTEND_DEFINITION.taskFromVariant(variant);
    const followUpTask = createFollowUpTask({
      task,
      submissions,
      variant,
      nextRoundIndex: 1,
    });

    return [
      {
        key: "answer",
        label: "1. Antwortphase",
        task: answerTask,
      },
      {
        key: "rate",
        label: "2. Bewertungsphase",
        task: followUpTask ?? answerTask,
        disabled: !followUpTask,
      },
    ];
  },
  variantFromTask: (task) => {
    const variantData = task["variantData"];
    if (isUnexpectedTaskVariantData(variantData)) return variantData;

    return {
      id: task.id,
      title: task.title,
      firstRoundSeconds: Number(task.durationSec ?? 35),
      secondRoundSeconds: Number(task["secondRoundSeconds"] ?? 25),
      answerQuestion: task.title,
      ratingQuestion: String(task["ratingQuestion"] ?? "Welche Antwort passt besser?"),
      sampleAnswers: [],
    };
  },
  variantMeta: (variant) => `${variant.answerQuestion} -> ${variant.ratingQuestion}`,
  initialDraft: () => ({
    answer: "",
    selectedAnswerId: null,
  }),
  reducePlayerEvent: (event, currentDraft) => {
    const e = event as {type?: unknown; draft?: unknown};
    return e.type === "draft-change" && isUnexpectedTaskDraft(e.draft)
      ? e.draft
      : currentDraft;
  },
  canSubmit: (draft, task) => {
    const phase = (task as UnexpectedTaskTask | undefined)?.phase ?? "answer";
    return phase === "rate" ? draft.selectedAnswerId !== null : draft.answer.trim().length > 0;
  },
  createSubmitPayload: (draft, task) => {
    const phase = (task as UnexpectedTaskTask | undefined)?.phase ?? "answer";
    return phase === "rate"
      ? {selectedAnswerId: draft.selectedAnswerId}
      : {answer: draft.answer.trim()};
  },
  createEditorSubmission: (playerId, draft, task) => {
    const phase = (task as UnexpectedTaskTask | undefined)?.phase ?? "answer";
    if (phase === "rate") {
      if (!draft.selectedAnswerId) return null;
      return {playerId, phase: "rate", selectedAnswerId: draft.selectedAnswerId};
    }

    const answer = draft.answer.trim();
    if (answer.length === 0) return null;
    return {playerId, phase: "answer", answer};
  },
  createSampleSubmission: (playerId, playerIndex, task) => {
    const unexpectedTask = task as UnexpectedTaskTask | undefined;
    if (unexpectedTask?.phase === "rate") {
      const comparison = unexpectedTask.comparisonsByPlayerId?.[playerId];
      return {
        playerId,
        phase: "rate",
        selectedAnswerId: playerIndex % 2 === 0
          ? comparison?.left.id ?? ""
          : comparison?.right.id ?? "",
      };
    }

    return {
      playerId,
      phase: "answer",
      answer: unexpectedTask?.variantData?.sampleAnswers[playerIndex] ??
        UNEXPECTED_TASK_VARIANTS[0]?.sampleAnswers[playerIndex] ??
        "Beispielantwort",
    };
  },
  calculateResults: (submissions, variant, task) =>
    calculateUnexpectedTaskEditorResults(submissions, variant, task as UnexpectedTaskTask | undefined),
  createEditorFollowUpTask: ({task, submissions, variant, nextRoundIndex}) => {
    const currentTask = task as UnexpectedTaskTask;
    if ((currentTask.phase ?? "answer") !== "answer") return null;

    return createFollowUpTask({task, submissions, variant, nextRoundIndex});
  },
  createPlayState: (args) => {
    const task = args.task as UnexpectedTaskTask;
    const phase = task.phase ?? "answer";

    return {
      playerId: args.playerId,
      phase,
      variantData: UNEXPECTED_TASK_FRONTEND_DEFINITION.variantFromTask(args.task),
      comparison: task.comparisonsByPlayerId?.[args.playerId],
      answerOptions: task.answerOptions,
      ownSubmission: normalizeSubmission(args.ownSubmission),
      draft: args.draft,
      ownResult: args.ownResult,
      roundEndsAt: args.roundEndsAt,
      serverNow: args.serverNow,
    };
  },
  createResultState: (args) => {
    const task = args.task as UnexpectedTaskTask;
    return {
      playerId: args.playerId,
      phase: "result",
      variantData: UNEXPECTED_TASK_FRONTEND_DEFINITION.variantFromTask(args.task),
      comparison: task.comparisonsByPlayerId?.[args.playerId],
      answerOptions: task.answerOptions,
      ownSubmission: normalizeSubmission(args.ownSubmission),
      ownResult: args.ownResult,
      roundEndsAt: args.roundEndsAt,
      serverNow: args.serverNow,
    };
  },
  scoringInfo: () => "Nach der unerwarteten Frage gewinnt die meistgewaehlte Antwort",
  draftLabel: (draft) => {
    if (draft.selectedAnswerId) return "Bewertung gewaehlt";
    const answer = draft.answer.trim();
    return answer ? `${answer} bereit` : null;
  },
  submissionLabel: (submission) =>
    submission.phase === "answer"
      ? `${submission.answer} abgegeben`
      : "Bewertung abgegeben",
  resultDetail: (result) => result.answer,
  resultValue: (result) => String(result.ratingCount),
  resultUnitLabel: () => "Bewertungen",
  resultSummary: ({submission, result}) => {
    const normalized = normalizeSubmission(submission);
    const unexpectedResult = result as UnexpectedTaskPlayerResult | undefined;
    if (unexpectedResult) {
      return `${unexpectedResult.answer}: ${unexpectedResult.ratingCount} Bewertung${unexpectedResult.ratingCount === 1 ? "" : "en"}.`;
    }
    if (normalized?.phase === "answer") return `Antwort gespeichert: ${normalized.answer}`;
    return "";
  },
};

function normalizeSubmission(
  submission: OpenMinigameSubmission | UnexpectedTaskSubmission | undefined,
): UnexpectedTaskSubmission | undefined {
  const payload = getPayloadObject(submission);
  if (!payload || !submission) return undefined;

  if (payload["phase"] === "answer" && typeof payload["answer"] === "string") {
    return {
      playerId: submission.playerId,
      phase: "answer",
      answer: payload["answer"],
    };
  }

  if (payload["phase"] === "rate" && typeof payload["selectedAnswerId"] === "string") {
    return {
      playerId: submission.playerId,
      phase: "rate",
      selectedAnswerId: payload["selectedAnswerId"],
    };
  }

  return undefined;
}

function isUnexpectedTaskDraft(value: unknown): value is UnexpectedTaskDraft {
  const draft = value as Partial<UnexpectedTaskDraft> | null;
  return !!draft &&
    typeof draft.answer === "string" &&
    (draft.selectedAnswerId === null || typeof draft.selectedAnswerId === "string");
}

function isUnexpectedTaskVariantData(value: unknown): value is UnexpectedTaskVariantData {
  const variant = value as Partial<UnexpectedTaskVariantData> | null;
  return !!variant &&
    typeof variant.id === "string" &&
    typeof variant.title === "string" &&
    typeof variant.firstRoundSeconds === "number" &&
    typeof variant.secondRoundSeconds === "number" &&
    typeof variant.answerQuestion === "string" &&
    typeof variant.ratingQuestion === "string" &&
    Array.isArray(variant.sampleAnswers) &&
    variant.sampleAnswers.every((sampleAnswer) => typeof sampleAnswer === "string");
}

function createFollowUpTask(args: {
  task: MinigameTask;
  submissions: UnexpectedTaskSubmission[];
  variant: UnexpectedTaskVariantData;
  nextRoundIndex: number;
}): MinigameTask | null {
  const currentTask = args.task as UnexpectedTaskTask;
  if ((currentTask.phase ?? "answer") !== "answer") return null;

  const answerOptions = buildAnswerOptions(args.submissions, args.variant, args.nextRoundIndex);
  const playerAnswerOptions = answerOptions.filter((answerOption) => answerOption.isPlayerAnswer);
  if (playerAnswerOptions.length < 2) return null;

  return {
    id: `${args.variant.id}:rate:editor-${args.nextRoundIndex}`,
    type: "unexpected-task",
    title: args.variant.ratingQuestion,
    durationSec: args.variant.secondRoundSeconds,
    phase: "rate",
    variantData: args.variant,
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

function buildAnswerOptions(
  submissions: UnexpectedTaskSubmission[],
  variant: UnexpectedTaskVariantData,
  nextRoundIndex: number,
): UnexpectedTaskAnswerOption[] {
  const playerAnswerOptions = submissions
    .filter((submission) => submission.phase === "answer")
    .map((submission) => ({
      id: `${submission.playerId}:${nextRoundIndex}`,
      playerId: submission.playerId,
      answer: submission.phase === "answer" ? submission.answer : "",
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

function calculateUnexpectedTaskEditorResults(
  submissions: UnexpectedTaskSubmission[],
  variant: UnexpectedTaskVariantData,
  task: UnexpectedTaskTask | undefined,
) {
  const phase = task?.phase ?? "answer";
  if (phase !== "answer") {
    return new UnexpectedTaskGame(variant, task?.answerOptions ?? []).calculateResults(submissions);
  }

  const answerSubmissions = submissions.filter((submission) => submission.phase === "answer");
  if (answerSubmissions.length !== 1) {
    return {resultsByPlayerId: {}};
  }

  const answerSubmission = answerSubmissions[0]!;
  return {
    resultsByPlayerId: {
      [answerSubmission.playerId]: {
        playerId: answerSubmission.playerId,
        placement: 1,
        answer: answerSubmission.answer,
        ratingCount: 0,
      },
    },
  };
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

function stableIndex(value: string, length: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % Math.max(1, length);
}
