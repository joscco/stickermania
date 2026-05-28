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

  // Optional task-aware component selection for minigames with multiple interactive phases.
  phaseComponentForTask?(task: MinigameTask): Type<unknown>;

  // Angular component for the player result view. It must accept a `state` input.
  resultComponent: Type<unknown>;

  // Optional editor-only controls. It must accept a `state` input and may emit `playerEvent`.
  editorComponent?: Type<unknown>;

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
  canSubmit(draft: TDraft, task?: MinigameTask): boolean;

  // Converts the current draft into the payload sent with submit-minigame.
  createSubmitPayload(draft: TDraft, task?: MinigameTask): unknown;

  // Creates a local editor submission from a draft, or null when the draft is incomplete.
  createEditorSubmission(playerId: string, draft: TDraft, task?: MinigameTask): TSubmission | null;

  // Creates deterministic sample data for one simulated editor player.
  createSampleSubmission(playerId: string, playerIndex: number, task?: MinigameTask): TSubmission;

  // Runs local editor scoring for this minigame.
  calculateResults(submissions: TSubmission[], variant: TVariant, task?: MinigameTask): MinigameResult<TResult>;

  // Optional editor-only follow-up task generated from the current task's submitted data.
  createEditorFollowUpTask?(args: {
    task: MinigameTask;
    submissions: TSubmission[];
    variant: TVariant;
    nextRoundIndex: number;
  }): MinigameTask | null;

  // Optional editor phase controls for minigames that expose multiple playable tasks.
  editorPhaseOptions?(args: {
    task: MinigameTask;
    variant: TVariant;
    submissions: TSubmission[];
  }): Array<{
    key: string;
    label: string;
    task: MinigameTask;
    disabled?: boolean;
  }>;

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

  // Optional state/event adapter for editorComponent.
  createEditorState?(variant: TVariant): unknown;

  reduceEditorEvent?(event: unknown, currentVariant: TVariant): TVariant;

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
