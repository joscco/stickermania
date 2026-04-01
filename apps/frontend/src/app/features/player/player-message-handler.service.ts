import { inject, Injectable, signal } from "@angular/core";
import type {
  DrawSearchModeState,
  DrawSearchPlayerTask,
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
        if (event.task.mode === "DRAW") {
          this.sessionStore.setTask(event.task);
          this.drawCount.set(event.task.drawIndex);
          this.maxDrawings.set(event.task.drawTotal);
        }
        if (event.task.mode === "SEARCH") {
          this.sessionStore.setTask(event.task);
        }
        break;

      case "player-phase":
        if (event.playerId === this.sessionStore.playerId()) {
          if (event.playerPhase === "IDLE") {
            this.sessionStore.clearTask("IDLE");
          }
        }
        break;

      case "score-update":
        if (event.playerId === this.sessionStore.playerId()) {
          this.sessionStore.showFeedback(`+1 Punkt! ${event.reason}`, "success");
        }
        break;

      case "round-phase":
        if (event.phase === "PAUSED") {
          this.sessionStore.clearTask();
        }
        break;

      case "draw-search-config":
        this.maxDrawings.set(event.maxDrawingsPerRound);
        this.worldStore.setFieldConfig({
          imageSizePx: event.imageSizePx,
          fieldBaseSize: event.fieldBaseSize,
          fieldGrowthPerDrawing: event.fieldGrowthPerDrawing,
          fieldMaxSize: event.fieldMaxSize,
          maxDrawingsPerRound: event.maxDrawingsPerRound,
          searchOverscroll: event.searchOverscroll,
        });
        break;

      case "search-result":
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
        if (modeState.round.phase === "LOBBY" || modeState.round.phase === "PAUSED") {
          this.sessionStore.clearTask("LOBBY");
          return;
        }
        const stateTask = this.deriveDrawSearchTask(playerId, modeState);
        if (stateTask) {
          this.sessionStore.setTask(stateTask);
          if (stateTask.mode === "DRAW") {
            this.drawCount.set(stateTask.drawIndex);
            this.maxDrawings.set(stateTask.drawTotal);
          }
          return;
        }
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

  private deriveDrawSearchTask(playerId: string, modeState: DrawSearchModeState): DrawSearchPlayerTask | null {
    const pa = modeState.promptAssignments[playerId];
    if (!pa) return null;

    if (pa.playerPhase === "DRAW" && pa.activeDrawPrompt) {
      return {
        mode: "DRAW",
        prompt: pa.activeDrawPrompt,
        drawIndex: pa.cycleIndex ?? pa.drawPromptIndex,
        drawTotal: (pa.cycleIndex ?? 0) + 1,
      };
    }

    if (pa.playerPhase === "SEARCH" && pa.activeSearchDrawingId) {
      const searchTask = pa.searchTasks.find((t) => t.drawingId === pa.activeSearchDrawingId);
      const drawing = modeState.drawings[pa.activeSearchDrawingId];
      if (!drawing || drawing.artistId === playerId) return null;
      return {
        mode: "SEARCH",
        prompt: searchTask?.prompt ?? drawing.prompt,
        drawingId: drawing.id,
        artistName: searchTask?.artistName ?? this.worldStore.players()[drawing.artistId]?.name ?? "Unbekannt",
      };
    }

    return null;
  }
}

