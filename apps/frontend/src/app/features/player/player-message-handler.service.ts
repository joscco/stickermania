import { inject, Injectable, signal } from "@angular/core";
import { Router } from "@angular/router";
import type { ServerToClientMessage } from "@birthday/shared";
import { GameSessionStore } from "../../core/challenge.store";
import { ReconnectService } from "../../core/reconnect.service";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import {DrawSearchEventHandler} from '../museum-game/services/draw-search-event-handler';
import {GardenEventHandler} from '../garden-game/services/garden-event-handler';
import {GraffitiEventHandler} from '../graffiti-game/services/graffiti-event-handler';

@Injectable()
export class PlayerMessageHandler {
  private readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  private readonly wsService = inject(WebSocketService);
  private readonly reconnectService = inject(ReconnectService);
  private readonly router = inject(Router);
  private readonly drawSearchHandler = inject(DrawSearchEventHandler);
  private readonly gardenHandler = inject(GardenEventHandler);
  private readonly graffitiHandler = inject(GraffitiEventHandler);

  /** Expose the playerId so the component can read it after 'welcome'. */
  public readonly playerId = signal<string | null>(null);

  /**
   * Session code used for reconnect storage.
   * Set by the component after route resolution.
   */
  public sessionCode = "";

  // ─── Main dispatch ──────────────────────────────────────────

  public handle(message: ServerToClientMessage): void {
    switch (message.type) {
      case "welcome":
        this.handleWelcome(message);
        break;
      case "session-state":
        this.worldStore.setSessionState(message.state);
        this.syncPlayerModeFromState();
        break;
      case "game-event":
        if (message.mode === "draw-search") {
          this.drawSearchHandler.handleEvent(message.event);
        } else if (message.mode === "garden-coop") {
          this.gardenHandler.handleEvent(message.event);
        } else if (message.mode === "team-graffiti") {
          this.graffitiHandler.handleEvent(message.event);
        }
        break;
      case "error":
        this.handleError(message.message);
        break;
    }
  }

  // ─── Welcome ────────────────────────────────────────────────

  private handleWelcome(message: Extract<ServerToClientMessage, { type: "welcome" }>): void {
    localStorage.setItem("birthday_server_session", message.serverSessionId);

    this.sessionStore.setJoined({
      sessionId: message.sessionId,
      playerId: message.playerId,
      clientId: message.clientId,
    });

    this.playerId.set(message.playerId);
    localStorage.setItem("birthday_player_id", message.playerId);

    this.wsService.updatePendingJoin({
      type: "join",
      kind: "player",
      sessionId: message.sessionId,
      playerId: message.playerId,
    });

    this.reconnectService.save({
      playerId: message.playerId,
      sessionId: message.sessionId,
      sessionCode: this.sessionCode,
      playerName: this.sessionStore.playerName(),
    });
  }

  // ─── State sync on reconnect ────────────────────────────────

  public syncPlayerModeFromState(): void {
    const playerId = this.sessionStore.playerId();
    const sessionState = this.worldStore.sessionState();
    if (!playerId || !sessionState) return;

    const player = sessionState.players[playerId];
    if (!player) {
      // Player not yet in state — can happen during initial join.
      // The isReady computed will keep showing a loading spinner;
      // the next session-state push should include us.
      return;
    }

    // Restore name
    if (player.name.trim().length > 0) {
      this.sessionStore.playerName.set(player.name);
      this.reconnectService.update({ playerName: player.name });
    } else if (this.sessionStore.playerName().trim().length > 0) {
      this.wsService.send({ type: "set-name", name: this.sessionStore.playerName() });
    }

    // If name or avatar missing → lobby
    if (this.sessionStore.playerName().trim().length === 0 || !player.avatarUrl) {
      this.sessionStore.currentMode.set("LOBBY");
      return;
    }

    // Delegate mode-specific sync to the respective handler
    switch (sessionState.activeMode) {
      case "draw-search":
        this.drawSearchHandler.syncMode(sessionState);
        return;
      case "garden-coop":
        this.gardenHandler.syncMode();
        return;
      case "team-graffiti":
        this.graffitiHandler.syncMode();
        return;
    }
  }

  // ─── Error handling ─────────────────────────────────────────

  private handleError(message: string): void {
    this.sessionStore.showFeedback(message, "error");

    // Session-fatal errors → stop reconnect, clear data, redirect to /join
    const fatal = /nicht gefunden|abgelaufen|gelöscht|wurde gelöscht|closed|deleted/i.test(message);
    if (fatal) {
      this.wsService.disconnect();      // stop reconnect loop → status stays "disconnected"
      this.reconnectService.clear();
      setTimeout(() => this.router.navigate(["/join"]), 2000);
    }
  }
}

