import type { SessionState } from "@birthday/shared";

export interface SessionRepository {
  create(sessionState: SessionState): Promise<void>;
  load(sessionId: string): Promise<SessionState | null>;
  loadByCode(sessionCode: string): Promise<SessionState | null>;
  save(sessionState: SessionState): Promise<void>;
  delete(sessionId: string): Promise<void>;
  listAll(): Promise<SessionState[]>;
  listExpired(now: number): Promise<SessionState[]>;
}
