import fs from "node:fs";
import path from "node:path";
import type { GameState } from "@birthday/shared";
import type { SessionRepository } from "../sessionRepository.js";

export class FileSessionRepository implements SessionRepository {
  public constructor(private readonly basePath: string) {}

  public async create(sessionState: GameState): Promise<void> {
    await this.save(sessionState);
  }

  public async load(sessionId: string): Promise<GameState | null> {
    const filePath = this.toFilePath(sessionId);
    try {
      const rawText = await fs.promises.readFile(filePath, "utf-8");
      return JSON.parse(rawText) as GameState;
    } catch {
      return null;
    }
  }

  public async loadByCode(sessionCode: string): Promise<GameState | null> {
    try {
      const entries = await fs.promises.readdir(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }

        const sessionId = entry.name.replace(/\.json$/u, "");
        const sessionState = await this.load(sessionId);

        if (sessionState?.sessionCode === sessionCode) {
          return sessionState;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  public async save(sessionState: GameState): Promise<void> {
    const filePath = this.toFilePath(sessionState.sessionId);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(sessionState, null, 2), "utf-8");
  }

  public async delete(sessionId: string): Promise<void> {
    const filePath = this.toFilePath(sessionId);
    await fs.promises.rm(filePath, { force: true });
  }

  public async listExpired(now: number): Promise<GameState[]> {
    try {
      const entries = await fs.promises.readdir(this.basePath, { withFileTypes: true });
      const results: GameState[] = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          continue;
        }
        const sessionId = entry.name.replace(/\.json$/u, "");
        const sessionState = await this.load(sessionId);
        if (sessionState && sessionState.expiresAt <= now) {
          results.push(sessionState);
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  private toFilePath(sessionId: string): string {
    return path.resolve(this.basePath, `${sessionId}.json`);
  }
}
