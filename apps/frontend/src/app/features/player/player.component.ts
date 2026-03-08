import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, effect, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import type {
  DrawSearchModeState,
  DrawSearchPlayerTask,
  DrawSearchServerEvent,
  GameModeId,
  GardenModeState,
  GardenServerEvent,
  ServerToClientMessage,
  TeamGraffitiModeState,
  TeamGraffitiServerEvent,
} from "@birthday/shared";
import { GameSessionStore } from "../../core/challenge.store";
import { ApiService } from "../../core/api.service";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import { IdleSearchWaitingComponent } from "./idle/idle-search-waiting.component";
import { LobbyAvatarComponent } from "./lobby/lobby-avatar.component";
import { LobbyNameComponent } from "./lobby/lobby-name.component";
import { LobbyReadyComponent } from "./lobby/lobby-ready.component";
import {SearchComponent} from '../museum-game/player/search';
import {DrawComponent} from '../museum-game/player/draw/draw.component';

// ── localStorage reconnect helper ───────────────────────────────────
const RECONNECT_STORAGE_KEY = "birthday_reconnect";

interface ReconnectPayload {
  playerId: string;
  sessionId: string;
  sessionCode: string;
  playerName: string;
}

function loadReconnectPayload(): ReconnectPayload | null {
  try {
    const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.playerId && parsed.sessionId && parsed.sessionCode) {
      return parsed as ReconnectPayload;
    }
  } catch { /* ignore */ }
  return null;
}

function saveReconnectPayload(payload: ReconnectPayload): void {
  localStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify(payload));
}

@Component({
  selector: "app-player",
  standalone: true,
  imports: [
    CommonModule,
    SearchComponent,
    LobbyNameComponent,
    LobbyAvatarComponent,
    LobbyReadyComponent,
    DrawComponent,
    IdleSearchWaitingComponent,
  ],
  templateUrl: "./player.component.html",
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly worldStore: WorldStore;
  public readonly sessionStore: GameSessionStore;

  public readonly playerColors = signal<string[]>(["#dc2626", "#2563eb"]);
  public readonly drawCount = signal<number>(0);
  public readonly maxDrawings = signal<number>(3);
  public readonly timeLeft = signal<string>("");

  private unsubscribeWs: (() => void) | null = null;
  private playerId: string | null = null;
  private sessionId: string | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public readonly activeMode = computed<GameModeId>(() => this.worldStore.activeMode());
  public readonly drawSearchModeState = computed<DrawSearchModeState | null>(() => this.worldStore.drawSearchModeState());
  public readonly gardenModeState = computed<GardenModeState | null>(() => this.worldStore.gardenModeState());
  public readonly teamGraffitiModeState = computed<TeamGraffitiModeState | null>(() => this.worldStore.teamGraffitiModeState());
  public readonly leaderboard = computed(() => this.worldStore.leaderboard());

  /** Global game phase: LOBBY | ACTIVE | PAUSED */
  public readonly gamePhase = computed(() => this.worldStore.round()?.phase ?? "LOBBY");

  /** Per-player phase from the prompt assignment */
  public readonly myPlayerPhase = computed(() => {
    const playerId = this.sessionStore.playerId();
    const modeState = this.drawSearchModeState();
    if (!playerId || !modeState) return null;
    return modeState.promptAssignments[playerId]?.playerPhase ?? null;
  });


  public readonly roundEndsAt = computed(() => {
    // draw-search no longer has a global timer
    if (this.activeMode() === "team-graffiti") {
      return this.teamGraffitiModeState()?.roundEndsAt ?? 0;
    }

    return 0;
  });

  public readonly myPlayer = computed(() => {
    const playerId = this.sessionStore.playerId();

    if (!playerId) {
      return null;
    }

    return this.worldStore.players()[playerId] ?? null;
  });

  public readonly myScore = computed(() => this.myPlayer()?.score ?? 0);
  public readonly sceneWidthPx = computed<number>(() => this.drawSearchModeState()?.effectiveFieldWidth ?? 400);
  public readonly sceneHeightPx = computed<number>(() => this.drawSearchModeState()?.effectiveFieldHeight ?? 400);
  public readonly isNameSet = computed(() => this.sessionStore.playerName().trim().length > 0);
  public readonly hasAvatar = computed(() => !!this.myPlayer()?.avatarUrl);
  public readonly currentTeamId = computed(() => this.myPlayer()?.teamId ?? null);

  public constructor(
    private readonly wsService: WebSocketService,
    private readonly apiService: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    worldStore: WorldStore,
    sessionStore: GameSessionStore,
  ) {
    this.worldStore = worldStore;
    this.sessionStore = sessionStore;

    // Restore player name from localStorage immediately
    const reconnect = loadReconnectPayload();
    if (reconnect?.playerName) {
      this.sessionStore.playerName.set(reconnect.playerName);
    }

    effect(() => {
      const endsAt = this.roundEndsAt();

      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }

      if (endsAt <= 0) {
        this.timeLeft.set("");
        return;
      }

      const updateCountdown = () => {
        const remainingMilliseconds = Math.max(0, endsAt - Date.now());
        const totalSeconds = Math.ceil(remainingMilliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        this.timeLeft.set(`${minutes}:${String(seconds).padStart(2, "0")}`);
      };

      updateCountdown();
      this.timerInterval = setInterval(updateCountdown, 500);
    });
  }

  public async ngOnInit(): Promise<void> {
    // Load reconnect payload from localStorage
    const reconnect = loadReconnectPayload();
    this.playerId = reconnect?.playerId ?? localStorage.getItem("birthday_player_id") ?? null;

    const sessionCode = this.resolveSessionCode();

    if (!sessionCode) {
      // If we have a stored session, auto-redirect there
      if (reconnect?.sessionCode) {
        await this.router.navigate(["/player"], {
          queryParams: { session: reconnect.sessionCode },
        });
        return;
      }
      await this.router.navigate(["/join"]);
      return;
    }

    try {
      const resolvedSession = await this.apiService.resolveSessionByCode(sessionCode);
      this.sessionId = resolvedSession.sessionId;
      this.sessionStore.setSession(this.sessionId);

      localStorage.setItem("birthday_last_session_code", resolvedSession.sessionCode);

      this.wsService.connect();
      this.unsubscribeWs = this.wsService.onMessage((message) => this.handleMessage(message));

      const joinCheckInterval = setInterval(() => {
        if (this.wsService.status() === "connected" && this.sessionId) {
          this.wsService.send({
            type: "join",
            kind: "player",
            sessionId: this.sessionId,
            playerId: this.playerId ?? undefined,
          });
          clearInterval(joinCheckInterval);
        }
      }, 200);

      this.registerGlobalAudioUnlock();
    } catch {
      this.sessionStore.showFeedback("Session wurde nicht gefunden oder ist abgelaufen.", "error");
      await this.router.navigate(["/join"]);
    }
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  public onNameSubmitted(name: string): void {
    this.wsService.send({ type: "set-name", name });
    this.sessionStore.playerName.set(name);
    // Persist name in reconnect payload
    this.updateReconnectPayload({ playerName: name });
  }

  public onAvatarSubmitted(dataUrl: string): void {
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: dataUrl });
    this.sessionStore.clearTask();
  }

  public onAvatarSkipped(): void {
    this.sessionStore.clearTask();
  }

  public onDrawingSubmitted(dataUrl: string): void {
    this.wsService.send({
      type: "game-action",
      mode: "draw-search",
      action: { type: "submit-drawing", imageDataUrl: dataUrl },
    });
    this.sessionStore.clearTask();
  }

  public plantSeed(plotId: string, plantId: string): void {
    this.wsService.send({
      type: "game-action",
      mode: "garden-coop",
      action: { type: "plant-seed", plotId, plantId },
    });
  }

  public waterPlant(plotId: string): void {
    this.wsService.send({
      type: "game-action",
      mode: "garden-coop",
      action: { type: "water-plant", plotId },
    });
  }

  public harvestPlant(plotId: string): void {
    this.wsService.send({
      type: "game-action",
      mode: "garden-coop",
      action: { type: "harvest-plant", plotId },
    });
  }

  public clearPest(plotId: string): void {
    this.wsService.send({
      type: "game-action",
      mode: "garden-coop",
      action: { type: "clear-pest", plotId },
    });
  }

  public assignTeam(teamId: "RED" | "BLUE"): void {
    const playerId = this.sessionStore.playerId();

    if (!playerId) {
      return;
    }

    this.wsService.send({
      type: "game-action",
      mode: "team-graffiti",
      action: { type: "assign-team", playerId, teamId },
    });
  }

  public placeTag(buildingId: string): void {
    this.wsService.send({
      type: "game-action",
      mode: "team-graffiti",
      action: { type: "place-tag", buildingId },
    });
  }

  public wipeTag(tagId: string): void {
    this.wsService.send({
      type: "game-action",
      mode: "team-graffiti",
      action: { type: "wipe-tag", tagId, progressDelta: 35 },
    });
  }

  public trackById(index: number, item: { id: string }): string {
    return item.id;
  }

  public gardenInventoryEntries(): Array<{ plantId: string; seeds: number; harvestedGoods: number; name: string }> {
    const modeState = this.gardenModeState();

    if (!modeState) {
      return [];
    }

    return Object.values(modeState.inventory)
      .map((inventoryItem) => ({
        plantId: inventoryItem.plantId,
        seeds: inventoryItem.seeds,
        harvestedGoods: inventoryItem.harvestedGoods,
        name: modeState.plantDefinitions[inventoryItem.plantId]?.name ?? inventoryItem.plantId,
      }))
      .sort((leftItem, rightItem) => leftItem.name.localeCompare(rightItem.name));
  }

  public gardenPlots(): Array<GardenModeState["plots"][string]> {
    const modeState = this.gardenModeState();
    return modeState ? Object.values(modeState.plots) : [];
  }

  public availablePlantIds(): string[] {
    return this.gardenModeState()?.unlockedPlantIds ?? [];
  }

  public plantName(plantId: string | null): string {
    if (!plantId) {
      return "";
    }

    return this.gardenModeState()?.plantDefinitions[plantId]?.name ?? plantId;
  }

  public availableTagsToWipe(): Array<TeamGraffitiModeState["activeTags"][string]> {
    const modeState = this.teamGraffitiModeState();
    const currentTeamId = this.currentTeamId();

    if (!modeState || !currentTeamId) {
      return [];
    }

    return Object.values(modeState.activeTags).filter((tag) => tag.teamId !== currentTeamId);
  }

  public teamBuildings(): Array<TeamGraffitiModeState["buildings"][string]> {
    const modeState = this.teamGraffitiModeState();
    return modeState ? Object.values(modeState.buildings) : [];
  }

  public tagsOnBuilding(buildingId: string): Array<TeamGraffitiModeState["activeTags"][string]> {
    const modeState = this.teamGraffitiModeState();

    if (!modeState) {
      return [];
    }

    return Object.values(modeState.activeTags).filter((tag) => tag.buildingId === buildingId);
  }

  // ── Message handling ──────────────────────────────────────────────

  private handleMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case "welcome": {
        const storedServerSession = localStorage.getItem("birthday_server_session");

        if (storedServerSession && storedServerSession !== message.serverSessionId) {
          // Server restarted – keep playerId, try to reconnect
          localStorage.setItem("birthday_server_session", message.serverSessionId);
          // Don't wipe playerId – the backend will create a new player if needed
        }

        localStorage.setItem("birthday_server_session", message.serverSessionId);
        this.sessionStore.setJoined({ sessionId: message.sessionId, playerId: message.playerId, clientId: message.clientId });
        this.playerId = message.playerId;
        localStorage.setItem("birthday_player_id", message.playerId);

        // Update the cached join message so reconnects reuse the same player
        this.wsService.updatePendingJoin({
          type: "join",
          kind: "player",
          sessionId: message.sessionId,
          playerId: message.playerId,
        });

        // Save reconnect payload
        const sessionCode = this.route.snapshot.queryParamMap.get("session") ?? localStorage.getItem("birthday_last_session_code") ?? "";
        saveReconnectPayload({
          playerId: message.playerId,
          sessionId: message.sessionId,
          sessionCode,
          playerName: this.sessionStore.playerName(),
        });

        if (message.assignedColors.length >= 2) {
          this.playerColors.set(message.assignedColors);
        }

        break;
      }

      case "session-state": {
        this.worldStore.setSessionState(message.state);
        this.worldStore.setConnected();
        this.syncPlayerModeFromState();
        break;
      }

      case "game-event": {
        if (message.mode === "draw-search") {
          this.handleDrawSearchEvent(message.event);
        } else if (message.mode === "garden-coop") {
          this.handleGardenEvent(message.event);
        } else if (message.mode === "team-graffiti") {
          this.handleTeamGraffitiEvent(message.event);
        }
        break;
      }

      case "session-event": {
        break;
      }

      case "error": {
        this.sessionStore.showFeedback(message.message, "error");
        break;
      }
    }
  }

  private handleDrawSearchEvent(event: DrawSearchServerEvent): void {
    switch (event.type) {
      case "assign-task": {
        // Directly set the task – per-player flow means we get tasks individually
        if (event.task.mode === "DRAW") {
          this.sessionStore.setTask(event.task);
          this.drawCount.set(event.task.drawIndex);
          this.maxDrawings.set(event.task.drawTotal);
        }

        if (event.task.mode === "SEARCH") {
          this.sessionStore.setTask(event.task);
        }
        break;
      }

      case "player-phase": {
        // Only react to our own player-phase events
        if (event.playerId === this.sessionStore.playerId()) {
          if (event.playerPhase === "IDLE") {
            this.sessionStore.clearTask("IDLE");
          }
          // DRAW and SEARCH phases are handled via assign-task events
        }
        break;
      }

      case "score-update": {
        if (event.playerId === this.sessionStore.playerId()) {
          this.sessionStore.showFeedback(`+1 Punkt! ${event.reason}`, "success");
        }
        break;
      }

      case "round-phase": {
        if (event.phase === "PAUSED") {
          this.sessionStore.clearTask();
        }
        break;
      }

      case "draw-search-config": {
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
      }

      case "search-result": {
        break;
      }
    }
  }

  private handleGardenEvent(event: GardenServerEvent): void {
    switch (event.type) {
      case "garden-level-up": {
        this.sessionStore.showFeedback(`Level ${event.newLevel} erreicht!`, "success");
        break;
      }

      case "garden-plot-ready": {
        this.sessionStore.showFeedback(`${this.plantName(event.plantId)} ist erntereif.`, "success");
        break;
      }

      case "garden-plot-needs-water": {
        this.sessionStore.showFeedback(`${this.plantName(event.plantId)} braucht Wasser.`, "error");
        break;
      }

      case "garden-pest-spawned": {
        this.sessionStore.showFeedback(`Ungeziefer bei ${this.plantName(event.plantId)}.`, "error");
        break;
      }

      case "garden-order-fulfilled": {
        this.sessionStore.showFeedback(`Auftrag erfüllt (+${event.experienceGained} XP).`, "success");
        break;
      }
    }
  }

  private handleTeamGraffitiEvent(event: TeamGraffitiServerEvent): void {
    switch (event.type) {
      case "team-assigned": {
        if (event.playerId === this.sessionStore.playerId()) {
          this.sessionStore.showFeedback(`Du bist jetzt Team ${event.teamId}.`, "success");
        }
        break;
      }

      case "tag-placed": {
        break;
      }

      case "tag-removed": {
        if (event.removedByPlayerId === this.sessionStore.playerId()) {
          this.sessionStore.showFeedback(`Tag entfernt. ${event.scoreAwarded} Punkte gesichert!`, "success");
        }
        break;
      }

      case "team-score-updated": {
        break;
      }
    }
  }

  /**
   * Sync current UI mode from persisted session state.
   * Now uses per-player `playerPhase` from prompt assignments
   * instead of global round phase.
   */
  private syncPlayerModeFromState(): void {
    const playerId = this.sessionStore.playerId();
    const sessionState = this.worldStore.sessionState();

    if (!playerId || !sessionState) {
      return;
    }

    const player = sessionState.players[playerId];

    if (!player) {
      // Player not found in session – don't wipe localStorage, just reload
      window.location.reload();
      return;
    }

    // Restore name from server state
    if (player.name.trim().length > 0) {
      this.sessionStore.playerName.set(player.name);
      this.updateReconnectPayload({ playerName: player.name });
    } else if (this.sessionStore.playerName().trim().length > 0) {
      // Client has a name from localStorage that the server doesn't know about yet
      // (e.g. after reconnect created a new player). Re-send it.
      this.wsService.send({ type: "set-name", name: this.sessionStore.playerName() });
    }

    // If name or avatar missing, show lobby
    if (this.sessionStore.playerName().trim().length === 0 || !player.avatarUrl) {
      this.sessionStore.currentMode.set("LOBBY");
      return;
    }

    switch (sessionState.activeMode) {
      case "draw-search": {
        const modeState = sessionState.modeState as DrawSearchModeState;

        // If game hasn't started yet (LOBBY or PAUSED), show lobby/ready
        if (modeState.round.phase === "LOBBY" || modeState.round.phase === "PAUSED") {
          this.sessionStore.clearTask("LOBBY");
          return;
        }

        // Game is ACTIVE – derive task from per-player state
        const stateTask = this.deriveDrawSearchTaskFromState(playerId, modeState);

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

      case "garden-coop": {
        this.sessionStore.clearTask("GARDEN");
        return;
      }

      case "team-graffiti": {
        this.sessionStore.clearTask("TEAM_GRAFFITI");
        return;
      }
    }
  }

  /**
   * Derive the current task from per-player prompt assignment state.
   * Uses playerPhase instead of global round phase.
   */
  private deriveDrawSearchTaskFromState(playerId: string, modeState: DrawSearchModeState): DrawSearchPlayerTask | null {
    const promptAssignment = modeState.promptAssignments[playerId];

    if (!promptAssignment) {
      return null;
    }

    // Use per-player phase instead of global round phase
    if (promptAssignment.playerPhase === "DRAW" && promptAssignment.activeDrawPrompt) {
      return {
        mode: "DRAW",
        prompt: promptAssignment.activeDrawPrompt,
        drawIndex: promptAssignment.cycleIndex ?? promptAssignment.drawPromptIndex,
        drawTotal: (promptAssignment.cycleIndex ?? 0) + 1,
      };
    }

    if (promptAssignment.playerPhase === "SEARCH" && promptAssignment.activeSearchDrawingId) {
      const activeSearchTask = promptAssignment.searchTasks.find((searchTask) => searchTask.drawingId === promptAssignment.activeSearchDrawingId);
      const activeDrawing = modeState.drawings[promptAssignment.activeSearchDrawingId];

      if (!activeDrawing || activeDrawing.artistId === playerId) {
        return null;
      }

      return {
        mode: "SEARCH",
        prompt: activeSearchTask?.prompt ?? activeDrawing.prompt,
        drawingId: activeDrawing.id,
        artistName: activeSearchTask?.artistName ?? this.worldStore.players()[activeDrawing.artistId]?.name ?? "Unbekannt",
      };
    }

    return null;
  }

  private resolveSessionCode(): string | null {
    const routeSessionCode = this.route.snapshot.queryParamMap.get("session");

    if (routeSessionCode && routeSessionCode.trim().length > 0) {
      return routeSessionCode.trim().toUpperCase();
    }

    const storedSessionCode = localStorage.getItem("birthday_last_session_code");
    return storedSessionCode?.trim().toUpperCase() ?? null;
  }

  private updateReconnectPayload(partial: Partial<ReconnectPayload>): void {
    const existing = loadReconnectPayload();
    const updated: ReconnectPayload = {
      playerId: partial.playerId ?? existing?.playerId ?? this.playerId ?? "",
      sessionId: partial.sessionId ?? existing?.sessionId ?? this.sessionId ?? "",
      sessionCode: partial.sessionCode ?? existing?.sessionCode ?? "",
      playerName: partial.playerName ?? existing?.playerName ?? this.sessionStore.playerName(),
    };

    if (updated.playerId && updated.sessionId) {
      saveReconnectPayload(updated);
    }
  }

  private registerGlobalAudioUnlock(): void {
    const unlockAudio = () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
  }
}
