import type {MinigameTask} from "@birthday/shared";
import type {MinigameFrontendDefinition} from "../frontend-definition";
import {getPayloadObject} from "../frontend-definition";
import {TimerStopGame} from "./game";
import type {TimerStopSubmission, TimerStopVariantData} from "./game";
import {TimerStopPhaseComponent} from "./player-ui/phase-0-stop/timer-stop-phase.component";
import {TimerStopResultComponent} from "./player-ui/result/timer-stop-result.component";
import {TIMER_STOP_VARIANTS} from "./variants";

export const TIMER_STOP_FRONTEND_DEFINITION: MinigameFrontendDefinition<
  TimerStopVariantData,
  number | null,
  TimerStopSubmission
> = {
  type: "timer-stop",
  label: "Timer Stop",
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
    const variant = TIMER_STOP_FRONTEND_DEFINITION.variantFromTask(args.task);
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
    const variant = TIMER_STOP_FRONTEND_DEFINITION.variantFromTask(args.task);
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

function isTimerStopVariantData(value: unknown): value is TimerStopVariantData {
  const variant = value as Partial<TimerStopVariantData> | null;
  return !!variant &&
    typeof variant.id === "string" &&
    typeof variant.title === "string" &&
    typeof variant.firstRoundSeconds === "number" &&
    typeof variant.targetSeconds === "number";
}
