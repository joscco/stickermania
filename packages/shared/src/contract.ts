import type {MinigamePlayerResult, MinigameResult, MinigameSubmission} from "./minigame.js";

// ─── Config types ────────────────────────────────────────────────

export interface GameConfig {
  port: number;
  adminPassword: string | null;
  sessionTtlHours: number;
  minigame: MinigameConfig;
}

export function parseGameConfig(raw: unknown): GameConfig {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  return {
    port: typeof r["port"] === "number" ? r["port"] : 3001,
    adminPassword: typeof r["adminPassword"] === "string" ? r["adminPassword"] : null,
    sessionTtlHours: typeof r["sessionTtlHours"] === "number" ? r["sessionTtlHours"] : 24,
    minigame: {tasks: []},
  };
}

export function parseMinigameConfig(raw: unknown): MinigameConfig {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const tasks = Array.isArray(r["tasks"]) ? r["tasks"] : [];

  return {
    tasks: tasks.filter(isMinigameTask) as MinigameTask[],
  };
}

function isMinigameTask(value: unknown): value is MinigameTask {
  if (typeof value !== "object" || value === null) return false;
  const task = value as Record<string, unknown>;
  return typeof task["id"] === "string" &&
    typeof task["type"] === "string" &&
    typeof task["title"] === "string";
}

export type ClientKind = "player" | "board";

export interface SessionPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarAssetPath: string | null;
  score: number;
  joinedAt: number;
  connected: boolean;
  isHost: boolean;
  teamId: string | null;
}

export interface SessionState {
  sessionId: string;
  sessionCode: string;
  players: Record<string, SessionPlayer>;
  gameState: StickerCollageGameState;
  revision: number;
  updatedAt: number;
  createdAt: number;
  expiresAt: number;
}

export interface SessionInfo {
  sessionId: string;
  sessionCode: string;
  playerJoinUrl: string;
  boardUrl: string;
  createdAt: number;
  expiresAt: number;
}

export type SessionClientToServerMessage =
  | { type: "join"; kind: ClientKind; sessionId: string; playerId?: string }
  | { type: "set-name"; name: string }
  | { type: "submit-avatar"; avatarDataUrl: string }
  | { type: "start-game-session" }
  | { type: "reset-session" }
  | { type: "ping"; t: number };

export type SessionServerToClientMessage =
  | { type: "welcome"; clientId: string; playerId: string; sessionId: string; serverTime: number; serverSessionId: string }
  | { type: "session-state"; state: SessionState }
  | { type: "session-event"; text: string; createdAt: number }
  | { type: "error"; message: string }
  | { type: "pong"; t: number; serverTime: number };

// ─── Phase state ────────────────────────────────────────────────

export interface StickerCollageLobbyState {
  phase: "LOBBY";
}

export interface StickerCollageBuildingState {
  phase: "BUILDING";
  roundEndsAt: number;
  skippedPlayerIds: string[];
}

export interface StickerCollageVotingState {
  phase: "VOTING";
  votingEndsAt: number;
  currentVotes: Record<string, string[]>;
  doneVotingIds: string[];
}

export interface StickerCollageResultsState {
  phase: "RESULTS";
  resultsEndsAt: number;
  winnerId: string | null;
  tiedWinnerIds: string[];
  readyToAdvanceIds: string[];
  lastVoteResults: StickerCollageVoteResult[];
}

export type GameSubState =
  | StickerCollageLobbyState
  | StickerCollageBuildingState
  | StickerCollageVotingState
  | StickerCollageResultsState;

// ─── Game state ─────────────────────────────────────────────────

export interface StickerCollageGameState {
  currentRoundIndex: number;
  currentPrompt: string;
  currentTask: MinigameTask | null;
  roundStartedAt: number | null;
  submissions: Record<number, StickerCollage[]>;
  minigameSubmissions: Record<number, OpenMinigameSubmission[]>;
  promptHistory: Record<number, string>;
  roundParticipantIds: string[];
  phaseState: GameSubState;
  roundDurationSec: number;
  votingDurationSec: number;
  resultsDurationSec: number;
}

export interface StickerCollage {
  id: string;
  playerId: string;
  roundIndex: number;
  placements: Array<{stickerId: string; x: number; y: number}>;
  submittedAt: number;
  snapshotUrl?: string;
}

export interface StickerCollageVoteResult {
  collageId: string;
  playerId: string;
  voteCount: number;
  placement: number;
  result?: MinigamePlayerResult;
}

// ─── Minigame config ────────────────────────────────────────────

export interface MinigameConfig {
  tasks: MinigameTask[];
}

export interface BaseMinigameTask {
  id: string;
  type: string;
  title: string;
  durationSec?: number;
  [key: string]: unknown;
}

export interface TimerStopTask extends BaseMinigameTask {
  type: "timer-stop";
  targetSec: number;
}

export type StickerPlaceTask = BaseMinigameTask & {type: "sticker-place"};
export type DrawingTask = BaseMinigameTask & {type: "drawing"};
export type ChoiceTask = BaseMinigameTask & {type: "choice"};
export type NumberTask = BaseMinigameTask & {type: "number"};
export type ShapeSplitTask = BaseMinigameTask & {type: "shape-split"};
export type TextAnswerTask = BaseMinigameTask & {type: "text-answer"};
export type ThesisTask = BaseMinigameTask & {type: "thesis"};

export type MinigameTask =
  | TimerStopTask
  | StickerPlaceTask
  | DrawingTask
  | ChoiceTask
  | NumberTask
  | ShapeSplitTask
  | TextAnswerTask
  | ThesisTask
  | BaseMinigameTask;

// ─── Open minigame protocol ─────────────────────────────────────

export interface OpenMinigameSubmission extends MinigameSubmission {
  minigameType: string;
  playerId: string;
  roundIndex: number;
  submittedAt: number;
  payload: unknown;
}

export interface DrawingSubmission extends MinigameSubmission {
  type: "drawing";
  playerId: string;
  roundIndex: number;
  imageDataUrl: string;
  submittedAt: number;
}

export interface TextAnswerSubmission extends MinigameSubmission {
  type: "text-answer";
  playerId: string;
  roundIndex: number;
  answer: string;
  submittedAt: number;
}

export type MinigameClientAction =
  | {
      type: "submit-minigame";
      minigameType: string;
      payload: unknown;
    };

export type StickerCollageClientAction =
  | { type: "skip-round" }
  | { type: "cast-vote"; collageId: string }
  | { type: "done-voting" }
  | { type: "ready-to-advance" }
  | { type: "start-game" }
  | { type: "end-round-early" }
  | { type: "end-voting-early" }
  | { type: "advance-from-results" };

export type GameClientAction = StickerCollageClientAction | MinigameClientAction;

export type StickerCollageServerEvent =
  | { type: "game-started" }
  | { type: "round-started"; roundIndex: number; prompt: string; endsAt: number }
  | { type: "collage-submitted"; playerId: string; collageId: string }
  | { type: "voting-started"; votingEndsAt: number }
  | { type: "vote-registered"; voterId: string; collageId: string }
  | { type: "vote-unregistered"; voterId: string; collageId: string }
  | { type: "results-ready"; winnerId: string | null; results: StickerCollageVoteResult[] };

export type GameClientEnvelope = {
  type: "game-action";
  action: GameClientAction;
};

export type GameServerEnvelope = {
  type: "game-event";
  event: StickerCollageServerEvent;
  targetPlayerId?: string;
};

export type ClientToServerMessage = SessionClientToServerMessage | GameClientEnvelope;
export type ServerToClientMessage = SessionServerToClientMessage | GameServerEnvelope;

// ─── Scoring adapter contract ───────────────────────────────────

export interface MinigameHandler<
  TTask extends MinigameTask = MinigameTask,
  TSubmission extends OpenMinigameSubmission = OpenMinigameSubmission,
> {
  readonly type: string;
  requiresVoting(task: TTask): boolean;
  createSubmission(args: {
    playerId: string;
    roundIndex: number;
    task: TTask;
    action: MinigameClientAction;
    now: number;
  }): TSubmission | null;
  evaluateSubmissions(args: {
    task: TTask;
    submissions: TSubmission[];
  }): {
    result: MinigameResult<MinigamePlayerResult>;
    voteResults: StickerCollageVoteResult[];
    winnerId: string | null;
    tiedWinnerIds: string[];
  };
  getResultSummary?(args: {task: TTask; submission: TSubmission | undefined; result: MinigamePlayerResult | undefined}): string;
}
