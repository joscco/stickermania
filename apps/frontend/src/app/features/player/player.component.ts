import { CommonModule } from "@angular/common";
import {
  Component, ElementRef, OnDestroy, OnInit, ViewChild,
  computed, signal, effect
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import { GameSessionStore } from "../../core/challenge.store";
import { AudioService } from "../../core/audio.service";
import { SearchComponent } from "./search";
import type { ServerToClientMessage } from "@birthday/shared";

/** Canvas internal resolution — always square */
const CANVAS_RESOLUTION = 300;

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule, FormsModule, SearchComponent],
  templateUrl: "./player.component.html",
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly session: GameSessionStore;

  @ViewChild("drawCanvas") drawCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("avatarCanvas") avatarCanvasRef!: ElementRef<HTMLCanvasElement>;

  public readonly nameInput = signal<string>("");
  public readonly currentColor = signal<string>("#dc2626");
  public readonly brushThin = signal<boolean>(true);
  public readonly playerColors = signal<string[]>(["#dc2626", "#2563eb"]);

  private isDrawing = false;
  private lastDrawPoint: { x: number; y: number } | null = null;
  private avatarCanvasInitialized = false;
  private drawCanvasInitialized = false;

  public readonly sceneWidthPx = signal<number>(1000);
  public readonly sceneHeightPx = signal<number>(1000);

  private unsubscribeWs: (() => void) | null = null;
  private playerId: string | null = null;

  public readonly drawCount = signal<number>(0);
  public readonly maxDrawings = signal<number>(3);

  public readonly leaderboard = computed(() => this.store.leaderboard());
  public readonly myScore = computed(() => {
    const playerIdValue = this.session.playerId();
    if (!playerIdValue) {
      return 0;
    }
    return this.store.players()[playerIdValue]?.score ?? 0;
  });

  public readonly roundEndsAt = computed(() => this.store.round()?.endsAt ?? 0);
  public readonly roundPhase = computed(() => this.store.round()?.phase ?? "LOBBY");

  public readonly timeLeft = signal<string>("");
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public get brushSize(): number {
    return this.brushThin() ? 3 : 10;
  }

  constructor(
    private readonly wsService: WebSocketService,
    private readonly audio: AudioService,
    worldStore: WorldStore,
    sessionStore: GameSessionStore,
  ) {
    this.store = worldStore;
    this.session = sessionStore;

    // Auto-initialize canvases when mode changes
    effect(() => {
      const mode = this.session.currentMode();
      const hasName = this.session.playerName().length > 0;
      if (mode === "LOBBY" && hasName) {
        this.avatarCanvasInitialized = false;
        setTimeout(() => this.initAvatarCanvas(), 80);
      }
      if (mode === "DRAW") {
        this.drawCanvasInitialized = false;
        setTimeout(() => this.initDrawCanvas(), 80);
      }
    });

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
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // ──────── WebSocket ────────

  private handleMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case "welcome":
        this.session.setJoined({ playerId: msg.playerId, clientId: msg.clientId });
        this.playerId = msg.playerId;
        localStorage.setItem("birthday_player_id", msg.playerId);
        if (msg.assignedColors && msg.assignedColors.length >= 2) {
          this.playerColors.set(msg.assignedColors);
          this.currentColor.set(msg.assignedColors[0]);
        }
        this.maxDrawings.set(msg.maxDrawingsPerRound ?? 3);
        {
          const existingPlayer = this.store.players()[msg.playerId];
          if (existingPlayer?.name) {
            this.session.playerName.set(existingPlayer.name);
          }
        }
        break;

      case "state":
        this.store.setGameState(msg.state);
        this.store.setConnected();
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
          this.drawCanvasInitialized = false;
          setTimeout(() => this.initDrawCanvas(), 80);
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

  /** Sync local player mode based on the latest game state from the server */
  private syncPlayerModeFromState(state: import("@birthday/shared").GameState): void {
    const playerIdValue = this.session.playerId();
    if (!playerIdValue) {
      return;
    }
    const player = state.players[playerIdValue];
    if (!player) {
      return;
    }

    if (player.name) {
      this.session.playerName.set(player.name);
      if (this.session.currentMode() === "LOBBY" && player.avatarDataUrl) {
        this.session.currentMode.set("IDLE");
      }
    }

    if (!player.avatarDataUrl) {
      return;
    }

    const phase = state.round.phase;
    const currentMode = this.session.currentMode();

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

  // ──────── Lobby ────────

  public submitName(): void {
    const name = this.nameInput().trim();
    if (name.length === 0) {
      return;
    }
    this.audio.unlockIfNeeded();
    this.wsService.send({ type: "set-name", name });
    this.session.playerName.set(name);
    this.session.currentMode.set("LOBBY");
  }

  public get isNameSet(): boolean {
    return this.session.playerName().length > 0;
  }

  public get hasAvatar(): boolean {
    const playerIdValue = this.session.playerId();
    return playerIdValue ? !!this.store.players()[playerIdValue]?.avatarDataUrl : false;
  }

  public submitAvatar(): void {
    const canvas = this.avatarCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }
    this.audio.unlockIfNeeded();
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: canvas.toDataURL("image/png") });
    this.session.currentMode.set("IDLE");
  }

  // ──────── Canvas ────────

  /** Shared canvas initialization — sets size and fills white */
  private initCanvas(canvasRef: ElementRef<HTMLCanvasElement> | undefined): boolean {
    const canvas = canvasRef?.nativeElement;
    if (!canvas) {
      return false;
    }
    canvas.width = CANVAS_RESOLUTION;
    canvas.height = CANVAS_RESOLUTION;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, CANVAS_RESOLUTION, CANVAS_RESOLUTION);
    }
    return true;
  }

  public initAvatarCanvas(): void {
    if (this.avatarCanvasInitialized) {
      return;
    }
    if (this.initCanvas(this.avatarCanvasRef)) {
      this.avatarCanvasInitialized = true;
    }
  }

  public initDrawCanvas(): void {
    if (this.drawCanvasInitialized) {
      return;
    }
    if (this.initCanvas(this.drawCanvasRef)) {
      this.drawCanvasInitialized = true;
    }
  }

  private getCanvasForType(canvasType: "draw" | "avatar"): HTMLCanvasElement | undefined {
    return canvasType === "draw"
      ? this.drawCanvasRef?.nativeElement
      : this.avatarCanvasRef?.nativeElement;
  }

  public onCanvasPointerDown(event: PointerEvent, canvasType: "draw" | "avatar"): void {
    event.preventDefault();
    this.audio.unlockIfNeeded();
    const canvas = this.getCanvasForType(canvasType);
    if (!canvas) {
      return;
    }
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.isDrawing = true;

    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RESOLUTION / rect.width;
    this.lastDrawPoint = {
      x: (event.clientX - rect.left) * scale,
      y: (event.clientY - rect.top) * scale,
    };

    const ctx = canvas.getContext("2d");
    if (ctx && this.lastDrawPoint) {
      ctx.fillStyle = this.currentColor();
      ctx.beginPath();
      ctx.arc(this.lastDrawPoint.x, this.lastDrawPoint.y, this.brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public onCanvasPointerMove(event: PointerEvent, canvasType: "draw" | "avatar"): void {
    if (!this.isDrawing || !this.lastDrawPoint) {
      return;
    }
    event.preventDefault();
    const canvas = this.getCanvasForType(canvasType);
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RESOLUTION / rect.width;
    const currentX = (event.clientX - rect.left) * scale;
    const currentY = (event.clientY - rect.top) * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.strokeStyle = this.currentColor();
    ctx.lineWidth = this.brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.lastDrawPoint.x, this.lastDrawPoint.y);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
    this.lastDrawPoint = { x: currentX, y: currentY };
  }

  public onCanvasPointerUp(): void {
    this.isDrawing = false;
    this.lastDrawPoint = null;
  }

  public clearCanvas(canvasType: "draw" | "avatar"): void {
    this.audio.unlockIfNeeded();
    this.audio.playTick();
    const canvas = this.getCanvasForType(canvasType);
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  public selectColor(color: string): void {
    this.audio.unlockIfNeeded();
    this.audio.playTick();
    this.currentColor.set(color);
  }

  public submitDrawing(): void {
    const canvas = this.drawCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }
    this.wsService.send({ type: "submit-drawing", imageDataUrl: canvas.toDataURL("image/png") });
    this.audio.unlockIfNeeded();
    this.audio.playPop();
    this.session.currentTask.set(null);
  }
}
