import { inject, Injectable, signal } from "@angular/core";
import type {
  DrawSearchModeState,
  DrawSearchServerEvent,
  GardenServerEvent,
  ServerToClientMessage,
  TeamGraffitiServerEvent,
} from "@birthday/shared";
import { GameSessionStore } from "../../core/challenge.store";
import { ReconnectService } from "../../core/reconnect.service";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import { GardenPlayerService } from "../garden-game/player/garden-player.service";

@Injectable()
export class PlayerMessageHandler {
  private readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  private readonly wsService = inject(WebSocketService);
  private readonly reconnectService = inject(ReconnectService);
  private readonly gardenService = inject(GardenPlayerService);

  /** Expose the playerId so the component can read it after 'welcome'. */
  public readonly playerId = signal<string | null>(null);

  public readonly drawCount = signal<number>(0);
  public readonly maxDrawings = signal<number>(3);

  /**
   * Resolve the session code that was used to join (for reconnect storage).
   * Set by the component after route resolution.
   */
  public sessionCode = "";

  public handle(message: ServerToClientMessage): void {
    switch (message.type) {
      case "welcome":
        this.handleWelcome(message);
        break;
      case "session-state":
        this.worldStore.setSessionState(message.state);
        this.worldStore.setConnected();
        this.syncPlayerModeFromState();
        break;
      case "game-event":
        if (message.mode === "draw-search") this.handleDrawSearchEvent(message.event);
        else if (message.mode === "garden-coop") this.handleGardenEvent(message.event);
        else if (message.mode === "team-graffiti") this.handleTeamGraffitiEvent(message.event);
        break;
      case "session-event":
        break;
      case "error":
        this.sessionStore.showFeedback(message.message, "error");
        break;
    }
  }

  // ── Welcome ─────────────────────────────────────────────────

  private handleWelcome(message: Extract<ServerToClientMessage, { type: "welcome" }>): void {
    const storedServerSession = localStorage.getItem("birthday_server_session");
    if (storedServerSession && storedServerSession !== message.serverSessionId) {
      localStorage.setItem("birthday_server_session", message.serverSessionId);
    }
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

  // ── Draw-Search ─────────────────────────────────────────────

  private handleDrawSearchEvent(event: DrawSearchServerEvent): void {
    switch (event.type) {
      case "assign-task":
        this.sessionStore.setTask(event.task);
        break;

      case "score-update":
        if (event.playerId === this.sessionStore.playerId()) {
          this.sessionStore.showFeedback(`+Punkte! ${event.reason}`, "success");
        }
        break;

      case "guess-result":
        if (event.correct) {
          this.sessionStore.showFeedback(`${event.message}`, "success");
        } else {
          this.sessionStore.showFeedback(`${event.message} Richtig war: „${event.correctTitle}"`, "error");
        }
        break;

      case "round-phase":
        if (event.phase === "LOBBY") {
          this.sessionStore.clearTask("LOBBY");
        }
        break;
    }
  }

  // ── Garden ──────────────────────────────────────────────────

  private handleGardenEvent(event: GardenServerEvent): void {
    switch (event.type) {
      case "garden-level-up":
        this.sessionStore.showFeedback(`Level ${event.newLevel} erreicht!`, "success");
        break;
      case "garden-plot-ready":
        this.sessionStore.showFeedback(`${this.gardenService.plantName(event.plantId)} ist erntereif.`, "success");
        break;
      case "garden-plot-needs-water":
        this.sessionStore.showFeedback(`${this.gardenService.plantName(event.plantId)} braucht Wasser.`, "error");
        break;
      case "garden-pest-spawned":
        this.sessionStore.showFeedback(`Ungeziefer bei ${this.gardenService.plantName(event.plantId)}.`, "error");
        break;
      case "garden-order-fulfilled":
        this.sessionStore.showFeedback(`Auftrag erfüllt (+${event.experienceGained} XP).`, "success");
        break;
    }
  }

  // ── Team Graffiti ───────────────────────────────────────────

  private handleTeamGraffitiEvent(event: TeamGraffitiServerEvent): void {
    switch (event.type) {
      case "team-assigned":
        if (event.playerId === this.sessionStore.playerId()) {
          const label = event.teamId === "DIAMOND" ? "♦️ Karo" : "♥️ Herz";
          this.sessionStore.showFeedback(`Du bist jetzt Team ${label}.`, "success");
        }
        break;
      case "house-tagged":
        break;
      case "house-wiped":
        if (event.wipedByPlayerId === this.sessionStore.playerId()) {
          this.sessionStore.showFeedback(`Tag entfernt!`, "success");
        }
        break;
      case "team-score-updated":
        break;
      case "actions-updated":
        if (event.playerId === this.sessionStore.playerId()) {
          // Silently handled through state sync
        }
        break;
    }
  }

  // ── State sync on reconnect ─────────────────────────────────

  public syncPlayerModeFromState(): void {
    const playerId = this.sessionStore.playerId();
    const sessionState = this.worldStore.sessionState();
    if (!playerId || !sessionState) return;

    const player = sessionState.players[playerId];
    if (!player) {
      window.location.reload();
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

    switch (sessionState.activeMode) {
      case "draw-search": {
        const modeState = sessionState.modeState as DrawSearchModeState;
        if (modeState.phase === "LOBBY") {
          this.sessionStore.clearTask("LOBBY");
          return;
        }
        // In ACTIVE phase, the server will re-send the task via onPlayerJoined.
        // If we already have a task (from a prior assign-task event), keep it.
        if (this.sessionStore.currentTask()) return;
        // If we're already in a draw-search task mode (DRAW/CAPTION/GUESS),
        // don't overwrite it — a session-state broadcast from another player
        // would otherwise reset our task mode.
        const current = this.sessionStore.currentMode();
        if (current === "DRAW" || current === "CAPTION" || current === "GUESS") return;
        this.sessionStore.clearTask("IDLE");
        return;
      }
      case "garden-coop":
        this.sessionStore.clearTask("GARDEN");
        return;
      case "team-graffiti":
        this.sessionStore.clearTask("TEAM_GRAFFITI");
        return;
    }
  }
}

