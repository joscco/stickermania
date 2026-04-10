import { Injectable, signal } from "@angular/core";

export type PlayerUiMode = "LOBBY" | "STICKER_COLLAGE" | "IDLE";

@Injectable({ providedIn: "root" })
export class GameSessionStore {
  public readonly sessionId = signal<string | null>(null);
  public readonly playerId = signal<string | null>(null);
  public readonly clientId = signal<string | null>(null);
  public readonly playerName = signal<string>("");
  public readonly currentMode = signal<PlayerUiMode>("LOBBY");
  public readonly feedback = signal<{ text: string; type: "success" | "error" } | null>(null);

  public setSession(sessionId: string): void {
    this.sessionId.set(sessionId);
  }

  public setJoined(args: { sessionId: string; playerId: string; clientId: string }): void {
    this.sessionId.set(args.sessionId);
    this.playerId.set(args.playerId);
    this.clientId.set(args.clientId);
  }

  public clearTask(nextMode: PlayerUiMode = "IDLE"): void {
    this.currentMode.set(nextMode);
  }

  public showFeedback(text: string, type: "success" | "error"): void {
    this.feedback.set({ text, type });
    setTimeout(() => this.feedback.set(null), 2500);
  }
}
