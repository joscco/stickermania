import { CommonModule } from "@angular/common";
import {
  AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild,
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
const CANVAS_RES = 300;

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule, FormsModule, SearchComponent],
  templateUrl: "./player.component.html"
})
export class PlayerComponent implements OnInit, AfterViewInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly session: GameSessionStore;

  @ViewChild("drawCanvas") drawCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("avatarCanvas") avatarCanvasRef!: ElementRef<HTMLCanvasElement>;

  public readonly nameInput = signal<string>("");

  // Drawing tools — only 2 assigned colors, no black/white freebies
  public readonly currentColor = signal<string>("#dc2626");
  public readonly brushThin = signal<boolean>(true); // true = thin (3), false = thick (10)
  /** Exactly 2 assigned colors */
  public readonly playerColors = signal<string[]>(["#dc2626", "#2563eb"]);


  private isDrawing = false;
  private lastDrawPoint: { x: number; y: number } | null = null;
  private avatarCanvasInitialized = false;
  private drawCanvasInitialized = false;

  // Scene dimensions (set from welcome message, passed to SearchComponent)
  public readonly sceneWidthPx = signal<number>(1000);
  public readonly sceneHeightPx = signal<number>(1000);

  private unsubscribeWs: (() => void) | null = null;
  private playerId: string | null = null;

  /** How many drawings submitted this round (from server) */
  public readonly drawCount = signal<number>(0);
  public readonly maxDrawings = signal<number>(3);

  public readonly leaderboard = computed(() => this.store.leaderboard());
  public readonly myScore = computed(() => {
    const pid = this.session.playerId();
    if (!pid) return 0;
    return this.store.players()[pid]?.score ?? 0;
  });

  public readonly roundEndsAt = computed(() => this.store.round()?.endsAt ?? 0);

  /** Timer countdown display */
  public readonly timeLeft = signal<string>("");
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public get brushSize(): number { return this.brushThin() ? 3 : 10; }

  constructor(
    private readonly wsService: WebSocketService,
    private readonly audio: AudioService,
    worldStore: WorldStore,
    sessionStore: GameSessionStore
  ) {
    this.store = worldStore;
    this.session = sessionStore;

    // Auto-initialize canvases based on what mode the player should be in
    effect(() => {
      const mode = this.session.currentMode();
      const nameSet = this.session.playerName().length > 0;
      if (mode === "LOBBY" && nameSet) {
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
      if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
      if (endsAt > 0) {
        const tick = () => {
          const left = Math.max(0, endsAt - Date.now());
          const sec = Math.ceil(left / 1000);
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          this.timeLeft.set(`${m}:${String(s).padStart(2, "0")}`);
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
    // Send initial join once WS is open (wsService will auto-re-send on reconnect)
    const checkJoin = setInterval(() => {
      if (this.wsService.status() === "connected") {
        this.wsService.send({ type: "join", kind: "player", playerId: this.playerId ?? undefined });
        clearInterval(checkJoin);
      }
    }, 200);
    // Also try to unlock audio on first touch anywhere in the document
    const globalUnlock = () => {
      this.audio.unlockIfNeeded();
      document.removeEventListener("pointerdown", globalUnlock);
      document.removeEventListener("touchstart", globalUnlock);
      document.removeEventListener("click", globalUnlock);
    };
    document.addEventListener("pointerdown", globalUnlock, { once: true });
    document.addEventListener("touchstart", globalUnlock, { once: true });
    document.addEventListener("click", globalUnlock, { once: true });
  }

  public ngAfterViewInit(): void {}

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) this.unsubscribeWs();
    if (this.timerInterval) clearInterval(this.timerInterval);
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
        const existing = this.store.players()[msg.playerId];
        if (existing?.name) this.session.playerName.set(existing.name);
        break;

      case "state":
        this.store.setGameState(msg.state);
        this.store.setConnected();
        const pid = this.session.playerId();
        if (pid && msg.state.players[pid]?.name) {
          this.session.playerName.set(msg.state.players[pid].name);
          if (this.session.currentMode() === "LOBBY" && msg.state.players[pid].avatarDataUrl) {
            this.session.currentMode.set("IDLE");
          }
        }
        // Sync mode from round phase if player is ready
        if (pid && msg.state.players[pid]?.avatarDataUrl) {
          const phase = msg.state.round.phase;
          const curMode = this.session.currentMode();
          if (phase === "DRAW") {
            // If the player is not already in DRAW and doesn't have a DRAW task,
            // go to IDLE — the assign-task message will switch to DRAW when it arrives.
            // But if we're stuck in a stale mode, move to IDLE so we're not frozen.
            if (curMode !== "DRAW" && curMode !== "IDLE" && curMode !== "LOBBY") {
              this.session.clearTask();
              this.session.currentMode.set("IDLE");
            }
          }
          if (phase === "SEARCH") {
            // Same: if we were in DRAW mode, transition to IDLE.
            // assign-task will move us to SEARCH if a task is available.
            if (curMode === "DRAW") {
              this.session.clearTask();
              this.session.currentMode.set("IDLE");
            }
          }
          if (phase === "PAUSED" || phase === "LOBBY") {
            if (curMode === "DRAW" || curMode === "SEARCH") {
              this.session.currentMode.set("IDLE");
              this.session.clearTask();
            }
            this.drawCount.set(0);
          }
        }
        break;

      case "assign-task":
        this.session.setTask(msg.task);
        // Clear the draw canvas for the new prompt
        if (msg.task.mode === "DRAW") {
          // Use drawIndex from backend to keep counter correct across reconnects
          this.drawCount.set(msg.task.drawIndex);
          this.maxDrawings.set(msg.task.drawTotal);
          if (msg.task.drawIndex === 0) this.audio.playRoundStart();
          this.drawCanvasInitialized = false;
          setTimeout(() => this.initDrawCanvas(), 80);
        }
        if (msg.task.mode === "SEARCH") {
          this.audio.playTick();
        }
        break;

      // search-result is now handled by SearchStore directly

      case "score-update":
        if (msg.playerId === this.session.playerId()) {
          this.session.showFeedback(`+1 Punkt! ${msg.reason}`, "success");
          this.audio.playTick();
        }
        break;

      case "event":
        // If server moved to a new phase but we have no task, go to IDLE
        if ((this.session.currentMode() === "DRAW" || this.session.currentMode() === "SEARCH") && !this.session.currentTask()) {
          this.session.currentMode.set("IDLE");
        }
        break;

      case "error":
        this.session.showFeedback(msg.message, "error");
        break;
    }
  }

  // ──────── Lobby ────────

  public submitName(): void {
    const name = this.nameInput().trim();
    if (name.length === 0) return;
    this.audio.unlockIfNeeded();
    this.wsService.send({ type: "set-name", name });
    this.session.playerName.set(name);
    this.session.currentMode.set("LOBBY");
  }

  public get isNameSet(): boolean { return this.session.playerName().length > 0; }
  public get hasAvatar(): boolean {
    const pid = this.session.playerId();
    return pid ? !!this.store.players()[pid]?.avatarDataUrl : false;
  }

  public submitAvatar(): void {
    const canvas = this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    this.audio.unlockIfNeeded();
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: canvas.toDataURL("image/png") });
    this.session.currentMode.set("IDLE");
  }

  public initAvatarCanvas(): void {
    if (this.avatarCanvasInitialized) return;
    const canvas = this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    this.avatarCanvasInitialized = true;
    canvas.width = CANVAS_RES;
    canvas.height = CANVAS_RES;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CANVAS_RES, CANVAS_RES); }
  }

  // ──────── Drawing Canvas ────────

  public initDrawCanvas(): void {
    if (this.drawCanvasInitialized) return;
    const canvas = this.drawCanvasRef?.nativeElement;
    if (!canvas) return;
    this.drawCanvasInitialized = true;
    canvas.width = CANVAS_RES;
    canvas.height = CANVAS_RES;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CANVAS_RES, CANVAS_RES); }
  }

  public onCanvasPointerDown(event: PointerEvent, canvasType: "draw" | "avatar"): void {
    event.preventDefault();
    this.audio.unlockIfNeeded();
    const canvas = canvasType === "draw" ? this.drawCanvasRef?.nativeElement : this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RES / rect.width;
    this.lastDrawPoint = { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
    const ctx = canvas.getContext("2d");
    if (ctx && this.lastDrawPoint) {
      ctx.fillStyle = this.currentColor();
      ctx.beginPath();
      ctx.arc(this.lastDrawPoint.x, this.lastDrawPoint.y, this.brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public onCanvasPointerMove(event: PointerEvent, canvasType: "draw" | "avatar"): void {
    if (!this.isDrawing || !this.lastDrawPoint) return;
    event.preventDefault();
    const canvas = canvasType === "draw" ? this.drawCanvasRef?.nativeElement : this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_RES / rect.width;
    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = this.currentColor();
    ctx.lineWidth = this.brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.lastDrawPoint.x, this.lastDrawPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastDrawPoint = { x, y };
  }

  public onCanvasPointerUp(): void { this.isDrawing = false; this.lastDrawPoint = null; }

  public clearCanvas(canvasType: "draw" | "avatar"): void {
    this.audio.unlockIfNeeded();
    this.audio.playTick();
    const canvas = canvasType === "draw" ? this.drawCanvasRef?.nativeElement : this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  public selectColor(color: string): void {
    this.audio.unlockIfNeeded();
    this.audio.playTick();
    this.currentColor.set(color);
  }

  public submitDrawing(): void {
    const canvas = this.drawCanvasRef?.nativeElement;
    if (!canvas) return;
    this.wsService.send({ type: "submit-drawing", imageDataUrl: canvas.toDataURL("image/png") });
    this.audio.unlockIfNeeded();
    this.audio.playPop();
    // Clear current task — will get next via assign-task, or go IDLE if limit reached
    this.session.currentTask.set(null);
  }
}
