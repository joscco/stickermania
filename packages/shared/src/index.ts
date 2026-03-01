// ════════════════════════════════════════════════════════════════════
//  Shared types for the Draw & Search birthday party game
// ════════════════════════════════════════════════════════════════════

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
  width: number;   // normalized 0..1
  height: number;   // normalized 0..1
  placedAt: number;
  foundBy: string | null;   // playerId of who found it
  foundAt: number | null;
}

export interface GameState {
  players: Record<string, Player>;
  drawings: Record<string, Drawing>;
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
  | { type: "search-tap"; drawingId: string }
  | { type: "request-task" }
  | { type: "reset" }
  | { type: "ping"; t: number };

export type ServerToClientMessage =
  | { type: "welcome"; clientId: string; playerId: string; serverTime: number }
  | { type: "state"; state: GameState }
  | { type: "assign-task"; task: PlayerTask }
  | { type: "search-result"; correct: boolean; drawingId: string; message: string }
  | { type: "score-update"; playerId: string; newScore: number; reason: string }
  | { type: "event"; text: string; createdAt: number }
  | { type: "error"; message: string }
  | { type: "pong"; t: number; serverTime: number };

// ──────── Prompt pool ────────

export const DRAW_PROMPTS: string[] = [
  "Katze", "Hund", "Sonne", "Haus", "Baum", "Blume", "Auto", "Schiff",
  "Fisch", "Vogel", "Stern", "Herz", "Mond", "Wolke", "Berg",
  "Schmetterling", "Regenbogen", "Schneemann", "Apfel", "Banane",
  "Eis", "Pizza", "Kuchen", "Ballon", "Geschenk", "Rakete", "Roboter",
  "Drache", "Einhorn", "Krone", "Diamant", "Gitarre", "Fußball",
  "Fahrrad", "Zug", "Flugzeug", "Anker", "Palme", "Kaktus", "Pilz",
  "Frosch", "Elefant", "Löwe", "Pinguin", "Schildkröte", "Schnecke",
  "Spinne", "Biene", "Delfin", "Hai",
  "Hamburger", "Pommes", "Donut", "Brezel", "Würstchen",
  "Geist", "Alien", "Hexe", "Pirat", "Ninja",
  "Leuchtturm", "Vulkan", "Insel", "Wasserfall", "Regenschirm"
];

// ──────── Helpers ────────

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const roundedValue = Math.floor(value);
  if (roundedValue < min) {
    return min;
  }
  if (roundedValue > max) {
    return max;
  }
  return roundedValue;
}
