import { Injectable, computed, signal } from "@angular/core";
import type {
  DrawSearchDrawing,
  DrawSearchGamePhase,
  DrawSearchModeState,
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

  public readonly drawSearchPhase = computed<DrawSearchGamePhase>(() => this.drawSearchModeState()?.phase ?? "LOBBY");
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

  public setSessionState(state: SessionState): void {
    this.sessionState.set(state);
    this.lastError.set(null);
  }

  public clearSessionState(): void {
    this.sessionState.set(null);
  }

}
