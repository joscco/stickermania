import type {Type} from "@angular/core";
import type {
  MinigamePlayerResult,
  MinigameResult,
  MinigameSubmission,
} from "../packages/shared/src/minigame";
import type {MinigameTask, OpenMinigameSubmission} from "@birthday/shared";
import {EstimateOpinionsGame} from "./estimate-opinions/game";
import type {
  EstimateOpinionsSubmission,
  EstimateOpinionsVariantData,
} from "./estimate-opinions/game";
import {ESTIMATE_OPINIONS_VARIANTS} from "./estimate-opinions/variants";
import {EstimateOpinionsPhaseComponent} from "./estimate-opinions/player-ui/phase-0-estimate/estimate-opinions-phase.component";
import {EstimateOpinionsResultComponent} from "./estimate-opinions/player-ui/result/estimate-opinions-result.component";
import {
  ESTIMATE_OPINIONS_STAGE_SIZE,
  EstimateOpinionsDraft,
} from "./estimate-opinions/player-ui/ui-contract";
import {TimerStopGame} from "./timer-stop/game";
import type {TimerStopSubmission, TimerStopVariantData} from "./timer-stop/game";
import {TIMER_STOP_VARIANTS} from "./timer-stop/variants";
import {TimerStopPhaseComponent} from "./timer-stop/player-ui/phase-0-stop/timer-stop-phase.component";
import {TimerStopResultComponent} from "./timer-stop/player-ui/result/timer-stop-result.component";
import {TIMER_STOP_STAGE_SIZE} from "./timer-stop/player-ui/ui-contract";

export interface MinigameFrontendDefinition<
  TVariant = unknown,
  TDraft = unknown,
  TSubmission extends MinigameSubmission = MinigameSubmission,
  TResult extends MinigamePlayerResult = MinigamePlayerResult,
> {
  type: string;
  label: string;
  stageSize: number;
  phaseComponent: Type<unknown>;
  resultComponent: Type<unknown>;
  variants: TVariant[];
  taskFromVariant(variant: TVariant): MinigameTask;
  variantFromTask(task: MinigameTask): TVariant;
  variantMeta(variant: TVariant): string;
  initialDraft(): TDraft;
  reducePlayerEvent(event: unknown, currentDraft: TDraft): TDraft;
  canSubmit(draft: TDraft): boolean;
  createSubmitPayload(draft: TDraft): unknown;
  createEditorSubmission(playerId: string, draft: TDraft): TSubmission | null;
  createSampleSubmission(playerId: string, playerIndex: number): TSubmission;
  calculateResults(submissions: TSubmission[], variant: TVariant): MinigameResult<TResult>;
  createPlayState(args: {
    playerId: string;
    task: MinigameTask;
    draft: TDraft;
    ownSubmission?: TSubmission;
    ownResult?: TResult;
    roundEndsAt: number;
    serverNow: number;
  }): unknown;
  createResultState(args: {
    playerId: string;
    task: MinigameTask;
    ownSubmission?: OpenMinigameSubmission | TSubmission;
    ownResult?: TResult;
    roundEndsAt: number;
    serverNow: number;
  }): unknown;
  scoringInfo(): string;
  draftLabel(draft: TDraft, variant: TVariant): string | null;
  submissionLabel(submission: TSubmission, variant: TVariant): string;
  resultDetail(result: TResult): string;
  resultValue(result: TResult): string;
  resultUnitLabel(result: TResult): string;
  resultSummary(args: {
    submission?: OpenMinigameSubmission;
    result?: MinigamePlayerResult;
  }): string;
}

const timerStopDefinition: MinigameFrontendDefinition<
  TimerStopVariantData,
  number | null,
  TimerStopSubmission
> = {
  type: "timer-stop",
  label: "Timer Stop",
  stageSize: TIMER_STOP_STAGE_SIZE,
  phaseComponent: TimerStopPhaseComponent,
  resultComponent: TimerStopResultComponent,
  variants: TIMER_STOP_VARIANTS,
  taskFromVariant: (variant) => ({
    id: variant.id,
    type: "timer-stop",
    title: variant.title,
    durationSec: variant.firstRoundSeconds,
    variantData: variant,
  }),
  variantFromTask: (task) => {
    const variantData = task["variantData"];
    if (isTimerStopVariantData(variantData)) return variantData;

    return {
      id: task.id,
      title: task.title,
      firstRoundSeconds: Number(task.durationSec ?? 10),
      targetSeconds: Number(task["targetSec"] ?? 5),
    };
  },
  variantMeta: (variant) => `Ziel ${variant.targetSeconds}s · Runde ${variant.firstRoundSeconds}s`,
  initialDraft: () => null,
  reducePlayerEvent: (event, currentDraft) => {
    const e = event as {type?: unknown; stoppedAtSeconds?: unknown};
    return e.type === "draft-change" && typeof e.stoppedAtSeconds === "number"
      ? e.stoppedAtSeconds
      : currentDraft;
  },
  canSubmit: (draft) => draft !== null,
  createSubmitPayload: (draft) => ({stoppedAtSeconds: draft}),
  createEditorSubmission: (playerId, draft) =>
    draft === null ? null : {playerId, stoppedAtSeconds: Math.max(0, draft)},
  createSampleSubmission: (playerId, playerIndex) => ({
    playerId,
    stoppedAtSeconds: [4.82, 5.31, 5.02, 6.14][playerIndex] ?? 5,
  }),
  calculateResults: (submissions, variant) =>
    new TimerStopGame(variant).calculateResults(submissions),
  createPlayState: (args) => {
    const variant = timerStopDefinition.variantFromTask(args.task);
    return {
      playerId: args.playerId,
      phase: "stop",
      variantData: variant,
      ownSubmission: args.ownSubmission,
      draftStoppedAtSeconds: args.draft ?? undefined,
      ownResult: args.ownResult,
      roundEndsAt: args.roundEndsAt,
      serverNow: args.serverNow,
    };
  },
  createResultState: (args) => {
    const variant = timerStopDefinition.variantFromTask(args.task);
    const payload = getPayloadObject(args.ownSubmission);
    const stoppedAtSeconds = payload ? Number(payload["stoppedAtSeconds"]) : NaN;

    return {
      playerId: args.playerId,
      phase: "result",
      variantData: variant,
      ownSubmission: Number.isFinite(stoppedAtSeconds)
        ? {playerId: args.playerId, stoppedAtSeconds}
        : undefined,
      ownResult: args.ownResult,
      roundEndsAt: args.roundEndsAt,
      serverNow: args.serverNow,
    };
  },
  scoringInfo: () => "Am nächsten an der Zielzeit gewinnt",
  draftLabel: (draft) => draft === null ? null : `${draft.toFixed(2)}s bereit`,
  submissionLabel: (submission) => `${submission.stoppedAtSeconds.toFixed(2)}s abgegeben`,
  resultDetail: (result) => {
    const timerResult = result as {stoppedAtSeconds?: number};
    return typeof timerResult.stoppedAtSeconds === "number"
      ? `${timerResult.stoppedAtSeconds.toFixed(2)}s`
      : "";
  },
  resultValue: (result) => {
    const timerResult = result as {deviationSeconds?: number};
    return typeof timerResult.deviationSeconds === "number"
      ? `${timerResult.deviationSeconds.toFixed(2)}s`
      : "";
  },
  resultUnitLabel: () => "daneben",
  resultSummary: ({submission, result}) => {
    const timerResult = result as {stoppedAtSeconds?: number; deviationSeconds?: number} | undefined;
    if (!submission || !timerResult) return "";
    if (
      typeof timerResult.stoppedAtSeconds === "number" &&
      typeof timerResult.deviationSeconds === "number"
    ) {
      return `${timerResult.stoppedAtSeconds.toFixed(2)}s gestoppt, ${timerResult.deviationSeconds.toFixed(2)}s neben dem Ziel.`;
    }
    return "";
  },
};

const estimateOpinionsDefinition: MinigameFrontendDefinition<
  EstimateOpinionsVariantData,
  EstimateOpinionsDraft,
  EstimateOpinionsSubmission
> = {
  type: "estimate-opinions",
  label: "Estimate Opinions",
  stageSize: ESTIMATE_OPINIONS_STAGE_SIZE,
  phaseComponent: EstimateOpinionsPhaseComponent,
  resultComponent: EstimateOpinionsResultComponent,
  variants: ESTIMATE_OPINIONS_VARIANTS,
  taskFromVariant: (variant) => ({
    id: variant.id,
    type: "estimate-opinions",
    title: variant.title,
    durationSec: variant.firstRoundSeconds,
    variantData: variant,
  }),
  variantFromTask: (task) => {
    const variantData = task["variantData"];
    if (isEstimateOpinionsVariantData(variantData)) return variantData;

    return {
      id: task.id,
      title: task.title,
      firstRoundSeconds: Number(task.durationSec ?? 45),
      question: task.title,
      optionA: String(task["optionA"] ?? "Ja"),
      optionB: String(task["optionB"] ?? "Nein"),
    };
  },
  variantMeta: (variant) => `${variant.optionA} / ${variant.optionB} · Runde ${variant.firstRoundSeconds}s`,
  initialDraft: () => ({
    choseOptionA: null,
    estimatedPercentageWithSameOpinion: 0.5,
  }),
  reducePlayerEvent: (event, currentDraft) => {
    const e = event as {type?: unknown; draft?: unknown};
    return e.type === "draft-change" && isEstimateOpinionsDraft(e.draft)
      ? e.draft
      : currentDraft;
  },
  canSubmit: (draft) => draft.choseOptionA !== null,
  createSubmitPayload: (draft) => draft,
  createEditorSubmission: (playerId, draft) =>
    draft.choseOptionA === null
      ? null
      : {
          playerId,
          choseOptionA: draft.choseOptionA,
          estimatedPercentageWithSameOpinion: clampPercentage(
            draft.estimatedPercentageWithSameOpinion,
          ),
        },
  createSampleSubmission: (playerId, playerIndex) => {
    const samples = [
      {choseOptionA: true, estimatedPercentageWithSameOpinion: 0.75},
      {choseOptionA: true, estimatedPercentageWithSameOpinion: 0.5},
      {choseOptionA: false, estimatedPercentageWithSameOpinion: 0.25},
      {choseOptionA: true, estimatedPercentageWithSameOpinion: 0.9},
    ];
    return {playerId, ...(samples[playerIndex] ?? samples[0])};
  },
  calculateResults: (submissions, variant) =>
    new EstimateOpinionsGame(variant).calculateResults(submissions),
  createPlayState: (args) => ({
    playerId: args.playerId,
    phase: "estimate",
    variantData: estimateOpinionsDefinition.variantFromTask(args.task),
    ownSubmission: args.ownSubmission,
    draft: args.draft,
    ownResult: args.ownResult,
    roundEndsAt: args.roundEndsAt,
    serverNow: args.serverNow,
  }),
  createResultState: (args) => {
    const payload = getPayloadObject(args.ownSubmission);
    const choseOptionA = payload?.["choseOptionA"];
    const estimatedPercentageWithSameOpinion = Number(
      payload?.["estimatedPercentageWithSameOpinion"],
    );

    return {
      playerId: args.playerId,
      phase: "result",
      variantData: estimateOpinionsDefinition.variantFromTask(args.task),
      ownSubmission:
        typeof choseOptionA === "boolean" &&
        Number.isFinite(estimatedPercentageWithSameOpinion)
          ? {
              playerId: args.playerId,
              choseOptionA,
              estimatedPercentageWithSameOpinion,
            }
          : undefined,
      ownResult: args.ownResult,
      roundEndsAt: args.roundEndsAt,
      serverNow: args.serverNow,
    };
  },
  scoringInfo: () => "Schätze deine eigene Zustimmungsgruppe - am nächsten dran gewinnt",
  draftLabel: (draft, variant) => {
    if (draft.choseOptionA === null) return null;
    return `${draft.choseOptionA ? variant.optionA : variant.optionB}, ${Math.round(draft.estimatedPercentageWithSameOpinion * 100)}% bereit`;
  },
  submissionLabel: (submission, variant) =>
    `${submission.choseOptionA ? variant.optionA : variant.optionB}, ${Math.round(submission.estimatedPercentageWithSameOpinion * 100)}%`,
  resultDetail: (result) => {
    const estimateResult = result as {
      chosenOption?: string;
      estimatedPercentageWithSameOpinion?: number;
    };
    return `${estimateResult.chosenOption ?? ""} · ${Math.round((estimateResult.estimatedPercentageWithSameOpinion ?? 0) * 100)}%`;
  },
  resultValue: (result) => {
    const estimateResult = result as {deviationPercentagePoints?: number};
    return `${(estimateResult.deviationPercentagePoints ?? 0).toFixed(1)} Pkt.`;
  },
  resultUnitLabel: () => "daneben",
  resultSummary: ({submission, result}) => {
    const estimateResult = result as {
      chosenOption?: string;
      estimatedPercentageWithSameOpinion?: number;
      realPercentageWithSameOpinion?: number;
    } | undefined;
    if (!submission || !estimateResult) return "";
    if (
      estimateResult.chosenOption &&
      typeof estimateResult.estimatedPercentageWithSameOpinion === "number" &&
      typeof estimateResult.realPercentageWithSameOpinion === "number"
    ) {
      return `${estimateResult.chosenOption}: ${Math.round(estimateResult.estimatedPercentageWithSameOpinion * 100)}% geschaetzt, ${Math.round(estimateResult.realPercentageWithSameOpinion * 100)}% tatsaechlich.`;
    }
    return "";
  },
};

const definitions = [timerStopDefinition, estimateOpinionsDefinition];

export function getMinigameFrontendDefinitions(): MinigameFrontendDefinition[] {
  return definitions;
}

export function getMinigameFrontendDefinition(
  type: string | undefined,
): MinigameFrontendDefinition | null {
  if (!type) return null;
  return definitions.find((definition) => definition.type === type) ?? null;
}

export function getMinigameCatalogTasks(): MinigameTask[] {
  return definitions.flatMap((definition) =>
    definition.variants.map((variant) =>
      definition.taskFromVariant(variant as never),
    ),
  );
}

function getPayloadObject(
  submission: OpenMinigameSubmission | MinigameSubmission | undefined,
): Record<string, unknown> | null {
  if (!submission || typeof submission !== "object") return null;
  const maybeOpen = submission as {payload?: unknown};
  if (typeof maybeOpen.payload === "object" && maybeOpen.payload !== null) {
    return maybeOpen.payload as Record<string, unknown>;
  }
  return submission as Record<string, unknown>;
}

function isTimerStopVariantData(value: unknown): value is TimerStopVariantData {
  const variant = value as Partial<TimerStopVariantData> | null;
  return !!variant &&
    typeof variant.id === "string" &&
    typeof variant.title === "string" &&
    typeof variant.firstRoundSeconds === "number" &&
    typeof variant.targetSeconds === "number";
}

function isEstimateOpinionsVariantData(value: unknown): value is EstimateOpinionsVariantData {
  const variant = value as Partial<EstimateOpinionsVariantData> | null;
  return !!variant &&
    typeof variant.id === "string" &&
    typeof variant.title === "string" &&
    typeof variant.firstRoundSeconds === "number" &&
    typeof variant.question === "string" &&
    typeof variant.optionA === "string" &&
    typeof variant.optionB === "string";
}

function isEstimateOpinionsDraft(value: unknown): value is EstimateOpinionsDraft {
  const draft = value as Partial<EstimateOpinionsDraft> | null;
  return !!draft &&
    (draft.choseOptionA === null || typeof draft.choseOptionA === "boolean") &&
    typeof draft.estimatedPercentageWithSameOpinion === "number";
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
