// ════════════════════════════════════════════════════════════════════
//  Shared types for the Draw & Search birthday party game
// ════════════════════════════════════════════════════════════════════

// ──────── Central game config (read from game.config.json) ────────

export interface GameConfig {
  fieldWidth: number;
  fieldHeight: number;
  playerColors: string[];
  colorsPerPlayer: number;
  drawPrompts: string[];
  drawDurationSec: number;
  searchDurationSec: number;
  /** Fixed drawing size as fraction of field width (e.g. 0.1 = 10%) */
  drawingSize: number;
  /** Max drawings per player per round (0 = unlimited) */
  maxDrawingsPerRound: number;
  /** How far the player can pan beyond the scene edge in search mode (fraction of scene, e.g. 0.15 = 15%) */
  searchOverscroll: number;
  canvasResolution: number;
  drawingsPath: string;
  port: number;
  adminPassword: string | null;
}

export function parseGameConfig(raw: unknown): GameConfig {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    fieldWidth: typeof obj["fieldWidth"] === "number" ? obj["fieldWidth"] : 1600,
    fieldHeight: typeof obj["fieldHeight"] === "number" ? obj["fieldHeight"] : 900,
    playerColors: Array.isArray(obj["playerColors"]) ? obj["playerColors"] as string[] : ["#dc2626", "#2563eb"],
    colorsPerPlayer: typeof obj["colorsPerPlayer"] === "number" ? obj["colorsPerPlayer"] : 2,
    drawPrompts: Array.isArray(obj["drawPrompts"]) ? obj["drawPrompts"] as string[] : ["Katze", "Hund", "Sonne"],
    drawDurationSec: typeof obj["drawDurationSec"] === "number" ? obj["drawDurationSec"] : 60,
    searchDurationSec: typeof obj["searchDurationSec"] === "number" ? obj["searchDurationSec"] : 90,
    drawingSize: typeof obj["drawingSize"] === "number" ? obj["drawingSize"] : 0.1,
    maxDrawingsPerRound: typeof obj["maxDrawingsPerRound"] === "number" ? obj["maxDrawingsPerRound"] : 3,
    searchOverscroll: typeof obj["searchOverscroll"] === "number" ? obj["searchOverscroll"] : 0.15,
    canvasResolution: typeof obj["canvasResolution"] === "number" ? obj["canvasResolution"] : 300,
    drawingsPath: typeof obj["drawingsPath"] === "string" ? obj["drawingsPath"] : "./drawings",
    port: typeof obj["port"] === "number" ? obj["port"] : 3001,
    adminPassword: typeof obj["adminPassword"] === "string" ? obj["adminPassword"] : null,
  };
}

// ──────── Game entities ────────

export interface Player {
  id: string;
  name: string;
  avatarDataUrl: string | null;
  score: number;
  joinedAt: number;
}

export interface Drawing {
  id: string;
  artistId: string;
  prompt: string;
  imageDataUrl: string;
  /** Normalized 0..1 position on the game field */
  x: number;
  y: number;
  /** Normalized size (fraction of field) */
  size: number;
  placedAt: number;
  foundBy: string | null;
  foundAt: number | null;
}

export type RoundPhase = "LOBBY" | "DRAW" | "SEARCH" | "PAUSED";

export interface RoundState {
  phase: RoundPhase;
  /** ms timestamp when current phase ends (0 = no timer) */
  endsAt: number;
  drawDurationSec: number;
  searchDurationSec: number;
  roundNumber: number;
}

export interface GameState {
  players: Record<string, Player>;
  drawings: Record<string, Drawing>;
  round: RoundState;
  revision: number;
  updatedAt: number;
}

export type PlayerMode = "LOBBY" | "DRAW" | "SEARCH" | "IDLE";

export interface DrawTask {
  mode: "DRAW";
  prompt: string;
}

export interface SearchTask {
  mode: "SEARCH";
  prompt: string;
  drawingId: string;
  artistName: string;
}

export type PlayerTask = DrawTask | SearchTask;

// ──────── WebSocket Protocol ────────

export type ClientKind = "player" | "board";

export type ClientToServerMessage =
  | { type: "join"; kind: ClientKind; playerId?: string }
  | { type: "set-name"; name: string }
  | { type: "submit-avatar"; avatarDataUrl: string }
  | { type: "submit-drawing"; imageDataUrl: string }
  | { type: "search-snapshot"; centerX: number; centerY: number; radius: number }
  | { type: "start-round" }
  | { type: "set-timer"; drawDurationSec: number; searchDurationSec: number }
  | { type: "reset" }
  | { type: "ping"; t: number };

export type ServerToClientMessage =
  | { type: "welcome"; clientId: string; playerId: string; serverTime: number; assignedColors: string[]; fieldWidth: number; fieldHeight: number; maxDrawingsPerRound: number; searchOverscroll: number }
  | { type: "state"; state: GameState }
  | { type: "assign-task"; task: PlayerTask }
  | { type: "search-result"; correct: boolean; drawingId: string; message: string }
  | { type: "score-update"; playerId: string; newScore: number; reason: string }
  | { type: "round-phase"; phase: RoundPhase; endsAt: number }
  | { type: "event"; text: string; createdAt: number }
  | { type: "error"; message: string }
  | { type: "pong"; t: number; serverTime: number };

// ──────── Helpers ────────

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const v = Math.floor(value);
  return v < min ? min : v > max ? max : v;
}
