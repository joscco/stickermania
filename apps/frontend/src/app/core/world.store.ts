import {computed, Injectable, signal} from "@angular/core";
import type {SessionPlayer, SessionState, StickerCollageGameState} from "@birthday/shared";

@Injectable({ providedIn: "root" })
export class WorldStore {

  public readonly sessionState = signal<SessionState | null>(null);
  public readonly lastError = signal<string | null>(null);
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

  public readonly stickerCollageGameState = computed<StickerCollageGameState | null>(() => {
    const sessionState = this.sessionState();

    if (!sessionState) {
      return null;
    }

    return sessionState.gameState;
  });

  public setSessionState(state: SessionState): void {
    this.sessionState.set(state);
    this.lastError.set(null);
  }

  public clearSessionState(): void {
    this.sessionState.set(null);
  }

}
