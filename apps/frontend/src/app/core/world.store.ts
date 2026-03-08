import { Injectable, computed, signal } from "@angular/core";
import type {
  DrawSearchDrawing,
  DrawSearchModeState,
  DrawSearchRoundState,
  GardenModeState,
  GameModeId,
  SessionPlayer,
  SessionState,
  TeamGraffitiModeState,
} from "@birthday/shared";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

@Injectable({ providedIn: "root" })
export class WorldStore {
  public readonly connectionStatus = signal<ConnectionStatus>("connecting");
  public readonly sessionState = signal<SessionState | null>(null);
  public readonly lastError = signal<string | null>(null);

  public readonly imageSizePx = signal<number>(160);
  public readonly fieldBaseSize = signal<number>(400);
  public readonly fieldGrowthPerDrawing = signal<number>(100);
  public readonly fieldMaxSize = signal<number>(6000);
  public readonly maxDrawingsPerRound = signal<number>(3);
  public readonly searchOverscroll = signal<number>(0.15);

  public readonly revision = computed(() => this.sessionState()?.revision ?? null);
  public readonly activeMode = computed<GameModeId>(() => this.sessionState()?.activeMode ?? "draw-search");
  public readonly players = computed<Record<string, SessionPlayer>>(() => this.sessionState()?.players ?? {});

  /** All players including those without a name, sorted by score desc then join time asc */
  public readonly allPlayers = computed<SessionPlayer[]>(() => {
    return Object.values(this.players())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.joinedAt - b.joinedAt;
      });
  });

  /** Only named players, used for game-relevant leaderboards */
  public readonly leaderboard = computed<SessionPlayer[]>(() => {
    return Object.values(this.players())
      .filter((player) => player.name.trim().length > 0)
      .sort((leftPlayer, rightPlayer) => {
        if (rightPlayer.score !== leftPlayer.score) {
          return rightPlayer.score - leftPlayer.score;
        }

        return leftPlayer.joinedAt - rightPlayer.joinedAt;
      });
  });

  public readonly drawSearchModeState = computed<DrawSearchModeState | null>(() => {
    const sessionState = this.sessionState();

    if (!sessionState || sessionState.activeMode !== "draw-search") {
      return null;
    }

    return sessionState.modeState as DrawSearchModeState;
  });

  public readonly gardenModeState = computed<GardenModeState | null>(() => {
    const sessionState = this.sessionState();

    if (!sessionState || sessionState.activeMode !== "garden-coop") {
      return null;
    }

    return sessionState.modeState as GardenModeState;
  });

  public readonly teamGraffitiModeState = computed<TeamGraffitiModeState | null>(() => {
    const sessionState = this.sessionState();

    if (!sessionState || sessionState.activeMode !== "team-graffiti") {
      return null;
    }

    return sessionState.modeState as TeamGraffitiModeState;
  });

  public readonly round = computed<DrawSearchRoundState | null>(() => this.drawSearchModeState()?.round ?? null);
  public readonly drawings = computed<Record<string, DrawSearchDrawing>>(() => this.drawSearchModeState()?.drawings ?? {});
  public readonly drawingsList = computed<DrawSearchDrawing[]>(() => {
    return Object.values(this.drawings()).sort((leftDrawing, rightDrawing) => leftDrawing.placedAt - rightDrawing.placedAt);
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

  public setSessionState(state: SessionState): void {
    this.sessionState.set(state);
    this.lastError.set(null);
  }

  public clearSessionState(): void {
    this.sessionState.set(null);
  }

  public setFieldConfig(args: {
    imageSizePx: number;
    fieldBaseSize: number;
    fieldGrowthPerDrawing: number;
    fieldMaxSize: number;
    maxDrawingsPerRound?: number;
    searchOverscroll?: number;
  }): void {
    this.imageSizePx.set(args.imageSizePx);
    this.fieldBaseSize.set(args.fieldBaseSize);
    this.fieldGrowthPerDrawing.set(args.fieldGrowthPerDrawing);
    this.fieldMaxSize.set(args.fieldMaxSize);

    if (typeof args.maxDrawingsPerRound === "number") {
      this.maxDrawingsPerRound.set(args.maxDrawingsPerRound);
    }

    if (typeof args.searchOverscroll === "number") {
      this.searchOverscroll.set(args.searchOverscroll);
    }
  }
}
