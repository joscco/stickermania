// ─── Config types ────────────────────────────────────────────────

import {minigameRegistry} from './minigames/index.js';

export {minigameRegistry, type MinigameHandler} from './minigames/index.js';

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

// ─── Phase-specific state slices ──────────────────────────────

export interface LobbyState {
    phase: "LOBBY";
}

export interface MiniGameState {
    phase: "MINIGAME";

    roundEndsAt: number;
    skippedPlayerIds: string[];
}

export interface MiniGameResultState {
    phase: "RESULTS";
    resultsEndsAt: number;
    winnerId: string | null;
    tiedWinnerIds: string[];
    readyToAdvanceIds: string[];
}

export type GameSubState =
    | LobbyState
    | MiniGameState
    | MiniGameResultState

// ─── Game state ───────────────────────────────────────────────

export interface StickerCollageGameState {
    currentRoundIndex: number;
    currentPrompt: string;
    currentTask: MinigameTask | null;
    roundStartedAt: number | null;
    minigameSubmissions: Record<number, MinigameSubmission[]>;
    promptHistory: Record<number, string>;
    roundParticipantIds: string[];
    phaseState: GameSubState;
    roundDurationSec: number;
    votingDurationSec: number;
    resultsDurationSec: number;
}

export type StickerCollageClientAction =
    | { type: "skip-round" }
    | { type: "cast-vote"; collageId: string }
    | { type: "done-voting" }
    | { type: "ready-to-advance" }
    | { type: "start-game" }
    | { type: "end-round-early" }
    | { type: "end-voting-early" }
    | { type: "advance-from-results" };

export type StickerCollageServerEvent =
    | { type: "game-started" }
    | { type: "round-started"; roundIndex: number; prompt: string; endsAt: number }
    | { type: "collage-submitted"; playerId: string; collageId: string }
    | { type: "voting-started"; votingEndsAt: number }
    | { type: "vote-registered"; voterId: string; collageId: string }
    | { type: "vote-unregistered"; voterId: string; collageId: string }
    | { type: "results-ready"; winnerId: string | null; results: StickerCollageVoteResult[] };

export type GameClientAction = StickerCollageClientAction | MinigameClientAction;

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

// ─── Minigame types ─────────────────────────────────────────────

// ── Task definitions (discriminated union) ─────────────────────

/** How the winner is determined for sticker placement games */
export type StickerPlaceGoal = 'closest-to-average' | 'furthest-from-average';

export interface StickerPlaceTask {
  id: string;
  type: "sticker-place";
  title: string;
  durationSec: number;
  /** Sprite refs for the stickers the player places, e.g. "sticker-shapes-heart" */
  stickerSvgs: string[];
  /** Optional background image sprite ref, e.g. "sprite:#sticker-eyes-open" */
  backgroundSvg?: string;
  /** How the winner is determined. Default: closest-to-average */
  goal?: StickerPlaceGoal;
}

export interface DrawingTask {
  id: string;
  type: "drawing";
  title: string;
  durationSec: number;
  /** Optional background image sprite ref to draw on */
  backgroundSvg?: string;
  /** Secret additional tasks — one per player, others must guess which was applied */
  extraTasks?: string[];
}

export interface ChoiceTask {
  id: string;
  type: "choice";
  title: string;
  durationSec: number;
  options: Array<{label: string; emoji?: string}>;
}

export interface NumberTask {
  id: string;
  type: "number";
  title: string;
  durationSec: number;
  min: number;
  max: number;
  default: number;
}

export interface TimerStopTask {
  id: string;
  type: "timer-stop";
  title: string;
  durationSec: number;
  targetSec: number;
}

export interface ShapeSplitTask {
  id: string;
  type: "shape-split";
  title: string;
  durationSec: number;
  /** Sprite ref for background shape, e.g. "sprite:#sticker-shapes-heart" */
  backgroundSvg?: string;
  /** Polygon vertices (viewBox-local coords, typically 0-200) */
  polygon: Array<{x: number; y: number}>;
  /** Target fraction 0-1 for the smaller side */
  targetFraction: number;
}

export interface TextAnswerTask {
  id: string;
  type: "text-answer";
  title: string;
  durationSec: number;
  /** Round 2 voting question shown when comparing two answers */
  voteQuestion: string;
}

export interface ThesisTask {
  id: string;
  type: "thesis";
  title: string;
  durationSec: number;
  /** Label für Option A, default: "Stimme zu" */
  optionA?: string;
  /** Label für Option B, default: "Stimme nicht zu" */
  optionB?: string;
}

export type MinigameTask =
  | StickerPlaceTask
  | DrawingTask
  | ChoiceTask
  | NumberTask
  | TimerStopTask
  | ShapeSplitTask
  | TextAnswerTask
  | ThesisTask;

// ── Config ──────────────────────────────────────────────────────

export interface MinigameConfig {
  tasks: MinigameTask[];
}

// ── Submissions ─────────────────────────────────────────────────

export interface StickerPlaceSubmission {
  type: "sticker-place";
  playerId: string;
  roundIndex: number;
  /** Positions for each placed sticker */
  positions: Array<{stickerId: string; x: number; y: number}>;
  submittedAt: number;
}

export interface DrawingSubmission {
  type: "drawing";
  playerId: string;
  roundIndex: number;
  imageDataUrl: string;
  submittedAt: number;
}

export interface ChoiceSubmission {
  type: "choice";
  playerId: string;
  roundIndex: number;
  selectedIndices: number[];
  submittedAt: number;
}

export interface NumberSubmission {
  type: "number";
  playerId: string;
  roundIndex: number;
  value: number;
  submittedAt: number;
}

export interface TimerStopSubmission {
  type: "timer-stop";
  playerId: string;
  roundIndex: number;
  elapsedSec: number;
  submittedAt: number;
}

export interface ShapeSplitSubmission {
  type: "shape-split";
  playerId: string;
  roundIndex: number;

  areaFraction: number;
  submittedAt: number;
}

export interface TextAnswerSubmission {
  type: "text-answer";
  playerId: string;
  roundIndex: number;
  answer: string;
  submittedAt: number;
}

export interface ThesisSubmission {
  type: "thesis";
  playerId: string;
  roundIndex: number;
  agreed: boolean;
  estimatedPercent: number;
  submittedAt: number;
}

// ── Client Actions ──────────────────────────────────────────────

export type MinigameClientAction =
  | { type: "start-game" }
  | { type: "submit-round" }
  | { type: "skip-round" }
  | { type: "ready-to-advance" }
