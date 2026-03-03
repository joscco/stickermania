import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, signal, effect } from "@angular/core";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import { GameSessionStore } from "../../core/challenge.store";
import { AudioService } from "../../core/audio.service";
import { SearchComponent } from "./search";
import { LobbyNameComponent } from "./lobby/lobby-name.component";
import { LobbyAvatarComponent } from "./lobby/lobby-avatar.component";
import { LobbyReadyComponent } from "./lobby/lobby-ready.component";
import { DrawComponent } from "./draw/draw.component";
import { IdleWaitingComponent } from "./idle/idle-waiting.component";
import { IdleSearchWaitingComponent } from "./idle/idle-search-waiting.component";
import type { ServerToClientMessage } from "@birthday/shared";

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
    IdleWaitingComponent,
    IdleSearchWaitingComponent,
  ],
  templateUrl: "./player.component.html",
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly session: GameSessionStore;

  public readonly playerColors = signal<string[]>(["#dc2626", "#2563eb"]);

  public readonly sceneWidthPx = computed<number>(() => this.store.gameState()?.effectiveFieldWidth ?? 400);
  public readonly sceneHeightPx = computed<number>(() => this.store.gameState()?.effectiveFieldHeight ?? 400);

  private unsubscribeWs: (() => void) | null = null;
  private playerId: string | null = null;

  public readonly drawCount = signal<number>(0);
  public readonly maxDrawings = signal<number>(3);

  public readonly leaderboard = computed(() => this.store.leaderboard());
  public readonly myScore = computed(() => {
    const playerIdValue = this.session.playerId();
    if (!playerIdValue) return 0;
    return this.store.players()[playerIdValue]?.score ?? 0;
  });

  public readonly roundEndsAt = computed(() => this.store.round()?.endsAt ?? 0);
  public readonly roundPhase = computed(() => this.store.round()?.phase ?? "LOBBY");

  public readonly timeLeft = signal<string>("");
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly wsService: WebSocketService,
    private readonly audio: AudioService,
    worldStore: WorldStore,
    sessionStore: GameSessionStore,
  ) {
    this.store = worldStore;
    this.session = sessionStore;

    // Keep timer display updated
    effect(() => {
      const endsAt = this.roundEndsAt();
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (endsAt > 0) {
        const tick = () => {
          const remainingMs = Math.max(0, endsAt - Date.now());
          const totalSeconds = Math.ceil(remainingMs / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;
          this.timeLeft.set(`${minutes}:${String(seconds).padStart(2, "0")}`);
        };
        tick();
        this.timerInterval = setInterval(tick, 500);
      } else {
        this.timeLeft.set("");
      }
    });
  }

  public ngOnInit(): void {
    this.playerId = localStorage.getItem("birthday_player_id") ?? null;
    this.wsService.connect();
    this.unsubscribeWs = this.wsService.onMessage((msg) => this.handleMessage(msg));

    const joinCheckInterval = setInterval(() => {
      if (this.wsService.status() === "connected") {
        this.wsService.send({ type: "join", kind: "player", playerId: this.playerId ?? undefined });
        clearInterval(joinCheckInterval);
      }
    }, 200);

    this.registerGlobalAudioUnlock();
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) this.unsubscribeWs();
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  // ──────── Computed getters for template ────────

  public get isNameSet(): boolean {
    return this.session.playerName().length > 0;
  }

  public get hasAvatar(): boolean {
    const playerIdValue = this.session.playerId();
    return playerIdValue ? !!this.store.players()[playerIdValue]?.avatarDataUrl : false;
  }

  // ──────── Sub-component event handlers ────────

  public onNameSubmitted(name: string): void {
    this.audio.unlockIfNeeded();
    this.wsService.send({ type: "set-name", name });
    this.session.playerName.set(name);
    this.session.currentMode.set("LOBBY");
  }

  public onAvatarSubmitted(dataUrl: string): void {
    this.audio.unlockIfNeeded();
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: dataUrl });
    this.session.currentMode.set("IDLE");
  }

  public onAvatarSkipped(): void {
    this.audio.unlockIfNeeded();
    this.session.currentMode.set("IDLE");
  }

  public onDrawingSubmitted(dataUrl: string): void {
    this.wsService.send({ type: "submit-drawing", imageDataUrl: dataUrl });
    this.audio.unlockIfNeeded();
    this.audio.playPop();
    this.session.currentTask.set(null);
  }

  // ──────── WebSocket ────────

  private handleMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case "welcome": {
        const storedServerSession = localStorage.getItem("birthday_server_session");
        if (storedServerSession && storedServerSession !== msg.serverSessionId) {
          localStorage.removeItem("birthday_player_id");
          localStorage.setItem("birthday_server_session", msg.serverSessionId);
          window.location.reload();
          return;
        }
        localStorage.setItem("birthday_server_session", msg.serverSessionId);

        this.session.setJoined({ playerId: msg.playerId, clientId: msg.clientId });
        this.playerId = msg.playerId;
        localStorage.setItem("birthday_player_id", msg.playerId);
        if (msg.assignedColors && msg.assignedColors.length >= 2) {
          this.playerColors.set(msg.assignedColors);
        }
        this.maxDrawings.set(msg.maxDrawingsPerRound ?? 3);
        this.store.setFieldConfig({
          imageSizePx: msg.imageSizePx,
          fieldBaseSize: msg.fieldBaseSize,
          fieldGrowthPerDrawing: msg.fieldGrowthPerDrawing,
          fieldMaxSize: msg.fieldMaxSize,
        });
        break;
      }

      case "state":
        this.store.setGameState(msg.state);
        this.store.setConnected();
        {
          const pid = this.session.playerId();
          if (pid && !msg.state.players[pid]) {
            localStorage.removeItem("birthday_player_id");
            window.location.reload();
            return;
          }
        }
        this.syncPlayerModeFromState(msg.state);
        break;

      case "assign-task":
        this.session.setTask(msg.task);
        if (msg.task.mode === "DRAW") {
          this.drawCount.set(msg.task.drawIndex);
          this.maxDrawings.set(msg.task.drawTotal);
          if (msg.task.drawIndex === 0) {
            this.audio.playRoundStart();
          }
        }
        if (msg.task.mode === "SEARCH") {
          this.audio.playTick();
        }
        break;

      case "score-update":
        if (msg.playerId === this.session.playerId()) {
          this.session.showFeedback(`+1 Punkt! ${msg.reason}`, "success");
          this.audio.playTick();
        }
        break;

      case "event": {
        const currentMode = this.session.currentMode();
        if ((currentMode === "DRAW" || currentMode === "SEARCH") && !this.session.currentTask()) {
          this.session.currentMode.set("IDLE");
        }
        break;
      }

      case "error":
        this.session.showFeedback(msg.message, "error");
        break;
    }
  }

  private syncPlayerModeFromState(state: import("@birthday/shared").GameState): void {
    const playerIdValue = this.session.playerId();
    if (!playerIdValue) return;
    const player = state.players[playerIdValue];
    if (!player) return;

    if (!player.name) {
      this.session.playerName.set("");
      this.session.currentTask.set(null);
      this.session.currentMode.set("LOBBY");
      this.drawCount.set(0);
      return;
    }

    this.session.playerName.set(player.name);

    const phase = state.round.phase;
    const currentMode = this.session.currentMode();

    if (currentMode === "LOBBY" && player.name) {
      if (phase === "DRAW" || phase === "SEARCH") {
        this.session.currentMode.set("IDLE");
      }
      return;
    }

    if (phase === "DRAW" && currentMode !== "DRAW" && currentMode !== "IDLE" && currentMode !== "LOBBY") {
      this.session.clearTask();
      this.session.currentMode.set("IDLE");
    }
    if (phase === "SEARCH" && currentMode === "DRAW") {
      this.session.clearTask();
      this.session.currentMode.set("IDLE");
    }
    if ((phase === "PAUSED" || phase === "LOBBY") && (currentMode === "DRAW" || currentMode === "SEARCH")) {
      this.session.currentMode.set("IDLE");
      this.session.clearTask();
      this.drawCount.set(0);
    }
  }

  // ──────── Audio ────────

  private registerGlobalAudioUnlock(): void {
    const unlock = () => {
      this.audio.unlockIfNeeded();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
  }
}
