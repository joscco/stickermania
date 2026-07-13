import {inject, Injectable, signal} from "@angular/core";
import {Router} from "@angular/router";
import type {ServerToClientMessage} from "@birthday/shared";
import {WorldStore} from '../state/world.store';
import {GameSessionStore} from '../state/session-state.store';
import {ReconnectService} from './reconnect.service';
import {RealtimeRuntimeService} from '../runtime/realtime-runtime.service';


@Injectable()
export class PlayerMessageHandler {
  private readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  private readonly realtime = inject(RealtimeRuntimeService);
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
      case "game-event":
        this.onGameEvent(message.event);
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

    this.realtime.updatePendingJoin({
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

  private onGameEvent(event: Extract<ServerToClientMessage, { type: "game-event" }>["event"]): void {
    switch (event.type) {
      case "sticker-created":
        this.worldStore.addCreatedStickerLocal(event.sticker);
        break;
      case "sticker-deleted":
        this.worldStore.deleteStickerLocal(event.stickerId);
        break;
      case "board-updated":
        break;
    }
  }

  // ─── State sync on reconnect ────────────────────────────────

  public syncPlayerModeFromState(): void {
    const playerId = this.sessionStore.playerId();
    const sessionState = this.worldStore.sessionState();

    if (!playerId || !sessionState) {
      return;
    }

    const player = sessionState.players[playerId];

    if (!player) {
      return;
    }

    const serverPlayerName = player.name.trim();
    const localPlayerName = this.sessionStore.playerName().trim();

    let playerNameForUpdate = localPlayerName;
    let shouldSubmitName = false;

    if (serverPlayerName.length > 0) {
      this.sessionStore.playerName.set(player.name);
      playerNameForUpdate = player.name.trim();
    } else if (localPlayerName.length > 0) {
      // We have a device-level name the server doesn't know yet → send it.
      shouldSubmitName = true;
    }

    if (shouldSubmitName) {
      this.realtime.send({
        type: "submit-user-data",
        name: playerNameForUpdate,
      });
    }

    if (this.realtime.externalPickerActive()) {
      return;
    }

    this.sessionStore.clearTask("STICKER_COLLAGE");
  }

  // ─── Error handling ─────────────────────────────────────────

  private onError(message: string): void {
    const isFatal = /nicht gefunden|abgelaufen|gelöscht|wurde gelöscht|closed|deleted/i.test(message);
    if (isFatal) {
      this.realtime.disconnect();
      this.reconnectService.clear();
      setTimeout(() => this.router.navigate([], {queryParams: {view: "landing", error: "invalid-session"}}), 2000);
    }
  }
}
