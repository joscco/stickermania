// Shared types for the Draw & Search birthday party game

export interface GameConfig {
  playerColors: string[];
  colorsPerPlayer: number;
  drawPrompts: string[];
  drawDurationSec: number;
  searchDurationSec: number;
  maxDrawingsPerRound: number;
  searchOverscroll: number;
  canvasResolution: number;
  drawingsPath: string;
  port: number;
  adminPassword: string | null;
  imageSizePx: number;
  fieldBaseSize: number;
  fieldGrowthPerDrawing: number;
  fieldMaxSize: number;
  sessionTtlHours: number;
}

export function parseGameConfig(raw: unknown): GameConfig {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    playerColors: Array.isArray(obj["playerColors"]) ? (obj["playerColors"] as string[]) : ["#dc2626", "#2563eb"],
    colorsPerPlayer: typeof obj["colorsPerPlayer"] === "number" ? obj["colorsPerPlayer"] : 2,
    drawPrompts: Array.isArray(obj["drawPrompts"]) ? (obj["drawPrompts"] as string[]) : ["Katze", "Hund", "Sonne"],
    drawDurationSec: typeof obj["drawDurationSec"] === "number" ? obj["drawDurationSec"] : 60,
    searchDurationSec: typeof obj["searchDurationSec"] === "number" ? obj["searchDurationSec"] : 90,
    maxDrawingsPerRound: typeof obj["maxDrawingsPerRound"] === "number" ? obj["maxDrawingsPerRound"] : 3,
    searchOverscroll: typeof obj["searchOverscroll"] === "number" ? obj["searchOverscroll"] : 0.15,
    canvasResolution: typeof obj["canvasResolution"] === "number" ? obj["canvasResolution"] : 300,
    drawingsPath: typeof obj["drawingsPath"] === "string" ? obj["drawingsPath"] : "./drawings",
    port: typeof obj["port"] === "number" ? obj["port"] : 3001,
    adminPassword: typeof obj["adminPassword"] === "string" ? obj["adminPassword"] : null,
    imageSizePx: typeof obj["imageSizePx"] === "number" ? obj["imageSizePx"] : 160,
    fieldBaseSize: typeof obj["fieldBaseSize"] === "number" ? obj["fieldBaseSize"] : 400,
    fieldGrowthPerDrawing: typeof obj["fieldGrowthPerDrawing"] === "number" ? obj["fieldGrowthPerDrawing"] : 100,
    fieldMaxSize: typeof obj["fieldMaxSize"] === "number" ? obj["fieldMaxSize"] : 6000,
    sessionTtlHours: typeof obj["sessionTtlHours"] === "number" ? obj["sessionTtlHours"] : 24,
  };
}

export interface Player {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarAssetPath: string | null;
  score: number;
  joinedAt: number;
}

export interface Drawing {
  id: string;
  artistId: string;
  prompt: string;
  imageUrl: string;
  imageAssetPath: string;
  x: number;
  y: number;
  placedAt: number;
  foundBy: string | null;
  foundAt: number | null;
}

export type RoundPhase = "LOBBY" | "DRAW" | "SEARCH" | "PAUSED";

export interface RoundState {
  phase: RoundPhase;
  endsAt: number;
  drawDurationSec: number;
  searchDurationSec: number;
  roundNumber: number;
}

export interface PlayerPromptAssignment {
  drawPrompts: string[];
  drawPromptIndex: number;
  activeDrawPrompt: string | null;
  searchTasks: Array<{ drawingId: string; prompt: string; artistName: string }>;
  searchTaskIndex: number;
  activeSearchDrawingId: string | null;
}

export interface GameState {
  sessionId: string;
  sessionCode: string;
  players: Record<string, Player>;
  drawings: Record<string, Drawing>;
  round: RoundState;
  promptAssignments: Record<string, PlayerPromptAssignment>;
  effectiveFieldWidth: number;
  effectiveFieldHeight: number;
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

export interface GameSession {
  id: string;
  code: string;
  status: "LOBBY" | "DRAW" | "SEARCH" | "FINISHED";
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  revision: number;
}

export type PlayerMode = "LOBBY" | "DRAW" | "SEARCH" | "IDLE";

export interface DrawTask {
  mode: "DRAW";
  prompt: string;
  drawIndex: number;
  drawTotal: number;
}

export interface SearchTask {
  mode: "SEARCH";
  prompt: string;
  drawingId: string;
  artistName: string;
}

export type PlayerTask = DrawTask | SearchTask;

export type ClientKind = "player" | "board";

export type ClientToServerMessage =
  | { type: "join"; kind: ClientKind; sessionId: string; playerId?: string }
  | { type: "set-name"; name: string }
  | { type: "submit-avatar"; avatarDataUrl: string }
  | { type: "submit-drawing"; imageDataUrl: string }
  | { type: "search-snapshot"; centerX: number; centerY: number; radius: number }
  | { type: "start-round" }
  | { type: "set-timer"; drawDurationSec: number; searchDurationSec: number }
  | { type: "reset" }
  | { type: "ping"; t: number };

export type ServerToClientMessage =
  | { type: "welcome"; clientId: string; playerId: string; sessionId: string; serverTime: number; serverSessionId: string; assignedColors: string[]; fieldWidth: number; fieldHeight: number; maxDrawingsPerRound: number; searchOverscroll: number; initialZoom: number; imageSizePx: number; fieldBaseSize: number; fieldGrowthPerDrawing: number; fieldMaxSize: number }
  | { type: "state"; state: GameState }
  | { type: "assign-task"; task: PlayerTask }
  | { type: "search-result"; correct: boolean; drawingId: string; message: string }
  | { type: "score-update"; playerId: string; newScore: number; reason: string }
  | { type: "round-phase"; phase: RoundPhase; endsAt: number }
  | { type: "event"; text: string; createdAt: number }
  | { type: "error"; message: string }
  | { type: "pong"; t: number; serverTime: number };

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const flooredValue = Math.floor(value);
  return flooredValue < min ? min : flooredValue > max ? max : flooredValue;
}
