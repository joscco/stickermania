import {inject, Injectable, signal} from "@angular/core";
import {Router} from "@angular/router";
import type {ServerToClientMessage} from "@birthday/shared";
import {ReconnectService} from '../../../core/reconnect.service';
import {WebSocketService} from '../../../core/websocket.service';
import {WorldStore} from '../../../core/world.store';
import {GameSessionStore} from '../../../core/challenge.store';

@Injectable()
export class PlayerMessageHandler {
  private readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  private readonly wsService = inject(WebSocketService);
  private readonly reconnectService = inject(ReconnectService);
  private readonly router = inject(Router);

  /** Expose the playerId so the component can read it after 'welcome'. */
  public readonly playerId = signal<string | null>(null);

  /** Session code, set by the component after route resolution. */
  public sessionCode = "";

  // ─── Main dispatch ──────────────────────────────────────────

  public handle(message: ServerToClientMessage): void {
    switch (message.type) {
      case "welcome":
        this.onWelcome(message);
        break;
      case "session-state":
        this.worldStore.setSessionState(message.state);
        this.syncPlayerModeFromState();
        break;
      case "error":
        this.onError(message.message);
        break;
    }
  }

  // ─── Welcome ────────────────────────────────────────────────

  private onWelcome(message: Extract<ServerToClientMessage, { type: "welcome" }>): void {
    this.sessionStore.setJoined({
      sessionId: message.sessionId,
      playerId: message.playerId,
      clientId: message.clientId,
    });

    this.playerId.set(message.playerId);

    this.wsService.updatePendingJoin({
      type: "join",
      kind: "player",
      sessionId: message.sessionId,
      playerId: message.playerId,
    });

    this.reconnectService.save({
      playerId: message.playerId,
      sessionId: message.sessionId,
    });
  }

  // ─── State sync on reconnect ────────────────────────────────

  public syncPlayerModeFromState(): void {
    const playerId = this.sessionStore.playerId();
    const sessionState = this.worldStore.sessionState();
    if (!playerId || !sessionState) return;

    const player = sessionState.players[playerId];
    if (!player) {
      // Not yet in state — initial join in progress; next state push will include us.
      return;
    }

    if (player.name.trim().length > 0) {
      this.sessionStore.playerName.set(player.name);
    } else if (this.sessionStore.playerName().trim().length > 0) {
      // We have a device-level name the server doesn't know yet → send it
      this.wsService.send({type: "set-name", name: this.sessionStore.playerName()});
    }

    if (this.sessionStore.playerName().trim().length === 0 || !player.avatarUrl) {
      this.sessionStore.currentMode.set("LOBBY");
      return;
    }

    this.sessionStore.clearTask("PARTY_GAME");
  }

  // ─── Error handling ─────────────────────────────────────────

  private onError(message: string): void {
    const isFatal = /nicht gefunden|abgelaufen|gelöscht|wurde gelöscht|closed|deleted/i.test(message);
    if (isFatal) {
      this.wsService.disconnect();
      this.reconnectService.clear();
      setTimeout(() => this.router.navigate([], {queryParams: {view: "landing", error: "invalid-session"}}), 2000);
    }
  }
}
