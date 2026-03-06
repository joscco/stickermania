import type { GameState } from "@birthday/shared";

export interface SessionRepository {
  create(sessionState: GameState): Promise<void>;
  load(sessionId: string): Promise<GameState | null>;
  loadByCode(sessionCode: string): Promise<GameState | null>;
  save(sessionState: GameState): Promise<void>;
  delete(sessionId: string): Promise<void>;
  listExpired(now: number): Promise<GameState[]>;
}
