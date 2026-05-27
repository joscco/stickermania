import {
  TimerStopPlayerResult,
  TimerStopSubmission,
  TimerStopVariantData,
} from "../game";

export type TimerStopPhase = "stop" | "result";

export const TIMER_STOP_STAGE_SIZE = 400;

export interface TimerStopPlayerUiState {
  playerId: string;
  phase: TimerStopPhase;
  variantData: TimerStopVariantData;
  ownSubmission?: TimerStopSubmission;
  draftStoppedAtSeconds?: number;
  ownResult?: TimerStopPlayerResult;
  roundEndsAt: number;
  serverNow: number;
}

export type TimerStopPlayerUiEvent =
  | {
      type: "draft-change";
      playerId: string;
      stoppedAtSeconds: number;
    }
  | {
      type: "ready-for-next";
      playerId: string;
    };
