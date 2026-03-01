import type { GameState } from "@birthday/shared";

export interface PersistedState {
  game: GameState;
}

/** Per-player session tracked on the server */
export interface PlayerSession {
  playerId: string;
  clientId: string;
  kind: "player" | "board";
  /** The prompt the player is currently drawing */
  currentDrawPrompt: string | null;
  /** The drawingId the player is currently searching for */
  currentSearchDrawingId: string | null;
  /** Prompts this player has already drawn (avoid repeats) */
  usedDrawPrompts: Set<string>;
  /** DrawingIds this player has already searched for */
  usedSearchIds: Set<string>;
  /** Whether the player alternates: last was "DRAW" or "SEARCH" */
  lastTaskMode: "DRAW" | "SEARCH" | null;
  /** How many drawings this player has submitted in the current round */
  drawCountThisRound: number;
}