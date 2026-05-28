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
  gameState: PartyGameState;
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

export interface PartyLobbyState {
  phase: "LOBBY";
}

export interface PartyRoundActiveState {
  phase: "ROUND_ACTIVE";
  roundEndsAt: number;
  autoSubmitGraceEndsAt?: number;
  skippedPlayerIds: string[];
}

export interface PartyRoundResultsState {
  phase: "ROUND_RESULTS";
  resultsEndsAt: number;
  winnerId: string | null;
  tiedWinnerIds: string[];
  readyToAdvanceIds: string[];
  lastResults: RoundVoteResult[];
}

export type GameSubState =
  | PartyLobbyState
  | PartyRoundActiveState
  | PartyRoundResultsState;

// ─── Game state ─────────────────────────────────────────────────

export interface PartyGameState {
  currentRoundIndex: number;
  currentPrompt: string;
  currentTask: MinigameTask | null;
  roundStartedAt: number | null;
  submissions: Record<number, RoundSubmission[]>;
  minigameSubmissions: Record<number, OpenMinigameSubmission[]>;
  promptHistory: Record<number, string>;
  playedTaskIds: string[];
  roundParticipantIds: string[];
  phaseState: GameSubState;
  roundDurationSec: number;
  resultsDurationSec: number;
}

export interface RoundSubmission {
  id: string;
  playerId: string;
  roundIndex: number;
  placements: Array<{stickerId: string; x: number; y: number}>;
  submittedAt: number;
  snapshotUrl?: string;
}

export interface RoundVoteResult {
  submissionId: string;
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

export type MinigameTask = BaseMinigameTask;

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

export type PartyGameClientAction =
  | { type: "skip-round" }
  | { type: "ready-to-advance" }
  | { type: "start-game" }
  | { type: "end-round-early" }
  | { type: "advance-from-results" };

export type GameClientAction = PartyGameClientAction | MinigameClientAction;

export type PartyGameServerEvent =
  | { type: "game-started" }
  | { type: "round-started"; roundIndex: number; prompt: string; endsAt: number }
  | { type: "submission-submitted"; playerId: string; submissionId: string }
  | { type: "results-ready"; winnerId: string | null; results: RoundVoteResult[] };

export type GameClientEnvelope = {
  type: "game-action";
  action: GameClientAction;
};

export type GameServerEnvelope = {
  type: "game-event";
  event: PartyGameServerEvent;
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
  createTasks?(): TTask[];
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
    voteResults: RoundVoteResult[];
    winnerId: string | null;
    tiedWinnerIds: string[];
  };
  createNextTaskAfterResults?(args: {
    task: TTask;
    submissions: TSubmission[];
    nextRoundIndex: number;
  }): MinigameTask | null;
  getResultSummary?(args: {task: TTask; submission: TSubmission | undefined; result: MinigamePlayerResult | undefined}): string;
}
