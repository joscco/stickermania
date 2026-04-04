import { Injectable, signal } from "@angular/core";
import type { DrawSearchPlayerTask } from "@birthday/shared";

export type PlayerUiMode = "LOBBY" | "DRAW" | "CAPTION" | "GUESS" | "IDLE" | "GARDEN" | "TEAM_GRAFFITI";

export interface GuessResultInfo {
  correct: boolean;
  message: string;
  correctTitle: string;
  drawingId: string;
}

@Injectable({ providedIn: "root" })
export class GameSessionStore {
  public readonly sessionId = signal<string | null>(null);
  public readonly playerId = signal<string | null>(null);
  public readonly clientId = signal<string | null>(null);
  public readonly playerName = signal<string>("");
  public readonly currentMode = signal<PlayerUiMode>("LOBBY");
  public readonly currentTask = signal<DrawSearchPlayerTask | null>(null);
  public readonly feedback = signal<{ text: string; type: "success" | "error" } | null>(null);

  /** True while the device-cached avatar is being auto-uploaded to the server. */
  public readonly avatarAutoUploading = signal(false);

  /** Stores the result of a guess until the player has seen it. */
  public readonly guessResult = signal<GuessResultInfo | null>(null);

  /** If a new task arrives while showing a guess result, buffer it here. */
  private pendingTask: DrawSearchPlayerTask | null = null;
  private guessResultTimer: ReturnType<typeof setTimeout> | null = null;

  public setSession(sessionId: string): void {
    this.sessionId.set(sessionId);
  }

  public setJoined(args: { sessionId: string; playerId: string; clientId: string }): void {
    this.sessionId.set(args.sessionId);
    this.playerId.set(args.playerId);
    this.clientId.set(args.clientId);
  }

  public setTask(task: DrawSearchPlayerTask): void {
    // If we're currently showing a guess result, buffer the task
    if (this.guessResult()) {
      this.pendingTask = task;
      return;
    }
    this.currentTask.set(task);
    this.currentMode.set(task.mode);
  }

  public clearTask(nextMode: PlayerUiMode = "IDLE"): void {
    this.currentTask.set(null);
    this.currentMode.set(nextMode);
  }

  public setGuessResult(result: GuessResultInfo): void {
    this.guessResult.set(result);
    this.pendingTask = null;

    // Auto-dismiss after delay and apply pending task
    if (this.guessResultTimer) clearTimeout(this.guessResultTimer);
    this.guessResultTimer = setTimeout(() => {
      this.dismissGuessResult();
    }, 2500);
  }

  public dismissGuessResult(): void {
    if (this.guessResultTimer) {
      clearTimeout(this.guessResultTimer);
      this.guessResultTimer = null;
    }
    this.guessResult.set(null);
    // Apply the buffered task if any
    if (this.pendingTask) {
      const task = this.pendingTask;
      this.pendingTask = null;
      this.currentTask.set(task);
      this.currentMode.set(task.mode);
    }
  }

  public showFeedback(text: string, type: "success" | "error"): void {
    this.feedback.set({ text, type });
    setTimeout(() => {
      this.feedback.set(null);
    }, 2500);
  }
}
