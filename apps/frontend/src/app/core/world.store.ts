import { Injectable, computed, signal } from "@angular/core";
import type { GameState, Player, Drawing, RoundState } from "@birthday/shared";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

@Injectable({ providedIn: "root" })
export class WorldStore {
  public readonly connectionStatus = signal<ConnectionStatus>("connecting");
  public readonly gameState = signal<GameState | null>(null);
  public readonly lastError = signal<string | null>(null);

  // ── Field & image config (received via welcome message) ───────────
  public readonly imageSizePx = signal<number>(160);
  public readonly fieldBaseSize = signal<number>(400);
  public readonly fieldGrowthPerDrawing = signal<number>(100);
  public readonly fieldMaxSize = signal<number>(6000);

  public readonly revision = computed(() => this.gameState()?.revision ?? null);

  public readonly players = computed<Record<string, Player>>(() => this.gameState()?.players ?? {});
  public readonly drawings = computed<Record<string, Drawing>>(() => this.gameState()?.drawings ?? {});
  public readonly round = computed<RoundState | null>(() => this.gameState()?.round ?? null);

  public readonly leaderboard = computed<Player[]>(() => {
    const players = Object.values(this.players());
    return players
      .filter(p => p.name.length > 0)
      .sort((a, b) => b.score - a.score);
  });

  public readonly drawingsList = computed<Drawing[]>(() => {
    return Object.values(this.drawings()).sort((a, b) => a.placedAt - b.placedAt);
  });

  public setConnected(): void {
    this.connectionStatus.set("connected");
    this.lastError.set(null);
  }

  public setConnecting(): void {
    this.connectionStatus.set("connecting");
  }

  public setDisconnected(): void {
    this.connectionStatus.set("disconnected");
  }

  public setError(message: string): void {
    this.lastError.set(message);
  }

  public setGameState(state: GameState): void {
    this.gameState.set(state);
    this.lastError.set(null);
  }

  public setFieldConfig(args: {
    imageSizePx: number;
    fieldBaseSize: number;
    fieldGrowthPerDrawing: number;
    fieldMaxSize: number;
  }): void {
    this.imageSizePx.set(args.imageSizePx);
    this.fieldBaseSize.set(args.fieldBaseSize);
    this.fieldGrowthPerDrawing.set(args.fieldGrowthPerDrawing);
    this.fieldMaxSize.set(args.fieldMaxSize);
  }
}
