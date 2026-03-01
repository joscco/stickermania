import { Injectable, signal } from "@angular/core";
import type { PlayerMode, PlayerTask } from "@birthday/shared";

@Injectable({ providedIn: "root" })
export class GameSessionStore {
  public readonly playerId = signal<string | null>(null);
  public readonly clientId = signal<string | null>(null);
  public readonly playerName = signal<string>("");
  public readonly currentMode = signal<PlayerMode>("LOBBY");
  public readonly currentTask = signal<PlayerTask | null>(null);

  /** Toast-like feedback messages */
  public readonly feedback = signal<{ text: string; type: "success" | "error" } | null>(null);

  public setJoined(args: { playerId: string; clientId: string }): void {
    this.playerId.set(args.playerId);
    this.clientId.set(args.clientId);
  }

  public setTask(task: PlayerTask): void {
    this.currentTask.set(task);
    this.currentMode.set(task.mode);
  }

  public clearTask(): void {
    this.currentTask.set(null);
    this.currentMode.set("IDLE");
  }

  public showFeedback(text: string, type: "success" | "error"): void {
    this.feedback.set({ text, type });
    setTimeout(() => {
      this.feedback.set(null);
    }, 2500);
  }
}
