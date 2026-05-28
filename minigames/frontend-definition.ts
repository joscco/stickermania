import type {Type} from "@angular/core";
import type {MinigameTask, OpenMinigameSubmission} from "@birthday/shared";
import type {
  MinigamePlayerResult,
  MinigameResult,
  MinigameSubmission,
} from "../packages/shared/src/minigame";

export interface MinigameFrontendDefinition<
  TVariant = unknown,
  TDraft = unknown,
  TSubmission extends MinigameSubmission = MinigameSubmission,
  TResult extends MinigamePlayerResult = MinigamePlayerResult,
> {
  // Stable minigame type used as registry key and submit-minigame minigameType.
  type: string;

  // Human-readable name for editor/catalog controls.
  label: string;

  // Angular component for the interactive player phase. It must accept a `state` input and may emit `playerEvent`.
  phaseComponent: Type<unknown>;

  // Angular component for the player result view. It must accept a `state` input.
  resultComponent: Type<unknown>;

  // Playable content/balancing variants owned by this minigame.
  variants: TVariant[];

  // Converts one owned variant into the generic task stored in session state.
  taskFromVariant(variant: TVariant): MinigameTask;

  // Recovers and validates this minigame's variant data from a generic task.
  variantFromTask(task: MinigameTask): TVariant;

  // Short secondary text for variant lists in the minigame editor.
  variantMeta(variant: TVariant): string;

  // Initial local player draft before the minigame UI has emitted any input.
  initialDraft(): TDraft;

  // Applies a UI event from phaseComponent to the current draft and returns the next draft.
  reducePlayerEvent(event: unknown, currentDraft: TDraft): TDraft;

  // Whether the current draft is complete enough for the Shell Submit button.
  canSubmit(draft: TDraft): boolean;

  // Converts the current draft into the payload sent with submit-minigame.
  createSubmitPayload(draft: TDraft): unknown;

  // Creates a local editor submission from a draft, or null when the draft is incomplete.
  createEditorSubmission(playerId: string, draft: TDraft): TSubmission | null;

  // Creates deterministic sample data for one simulated editor player.
  createSampleSubmission(playerId: string, playerIndex: number): TSubmission;

  // Runs local editor scoring for this minigame.
  calculateResults(submissions: TSubmission[], variant: TVariant): MinigameResult<TResult>;

  // Builds the exact state object expected by phaseComponent.
  createPlayState(args: {
    playerId: string;
    task: MinigameTask;
    draft: TDraft;
    ownSubmission?: TSubmission;
    ownResult?: TResult;
    roundEndsAt: number;
    serverNow: number;
  }): unknown;

  // Builds the exact state object expected by resultComponent.
  createResultState(args: {
    playerId: string;
    task: MinigameTask;
    ownSubmission?: OpenMinigameSubmission | TSubmission;
    ownResult?: TResult;
    roundEndsAt: number;
    serverNow: number;
  }): unknown;

  // Short explanation of how this minigame is scored.
  scoringInfo(): string;

  // Compact display text for an in-progress draft in the editor/player shell.
  draftLabel(draft: TDraft, variant: TVariant): string | null;

  // Compact display text for a submitted editor/player shell entry.
  submissionLabel(submission: TSubmission, variant: TVariant): string;

  // Secondary result text, usually the player's answer or submitted value.
  resultDetail(result: TResult): string;

  // Primary result metric, usually the deviation or score.
  resultValue(result: TResult): string;

  // Tiny label for resultValue, e.g. "daneben".
  resultUnitLabel(result: TResult): string;

  // One-sentence personal result summary for the player result screen.
  resultSummary(args: {
    submission?: OpenMinigameSubmission;
    result?: MinigamePlayerResult;
  }): string;
}

export function getPayloadObject(
  submission: OpenMinigameSubmission | MinigameSubmission | undefined,
): Record<string, unknown> | null {
  if (!submission || typeof submission !== "object") return null;
  const maybeOpen = submission as {payload?: unknown};
  if (typeof maybeOpen.payload === "object" && maybeOpen.payload !== null) {
    return maybeOpen.payload as Record<string, unknown>;
  }
  return submission as Record<string, unknown>;
}
