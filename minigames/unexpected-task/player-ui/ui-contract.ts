import type {
  UnexpectedTaskAnswerOption,
  UnexpectedTaskComparison,
  UnexpectedTaskPlayerResult,
  UnexpectedTaskVariantData,
} from "../game";

export type UnexpectedTaskPhase = "answer" | "rate" | "result";

export interface UnexpectedTaskDraft {
  answer: string;
  selectedAnswerId: string | null;
}

export interface UnexpectedTaskPlayerUiState {
  playerId: string;
  phase: UnexpectedTaskPhase;
  variantData: UnexpectedTaskVariantData;
  comparison?: UnexpectedTaskComparison;
  answerOptions?: UnexpectedTaskAnswerOption[];
  ownSubmission?: {
    playerId: string;
    phase: "answer" | "rate";
    answer?: string;
    selectedAnswerId?: string;
  };
  draft?: UnexpectedTaskDraft;
  ownResult?: UnexpectedTaskPlayerResult;
  roundEndsAt: number;
  serverNow: number;
}

export type UnexpectedTaskPlayerUiEvent = {
  type: "draft-change";
  playerId: string;
  draft: UnexpectedTaskDraft;
};
