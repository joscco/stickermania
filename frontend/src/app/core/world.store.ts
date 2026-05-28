import {computed, Injectable, signal} from "@angular/core";
import type {SessionPlayer, SessionState, PartyGameState} from "@birthday/shared";

@Injectable({ providedIn: "root" })
export class WorldStore {

  public readonly sessionState = signal<SessionState | null>(null);
  public readonly lastError = signal<string | null>(null);
  public readonly players = computed<Record<string, SessionPlayer>>(() => this.sessionState()?.players ?? {});

  public readonly partyGameState = computed<PartyGameState | null>(() => {
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
