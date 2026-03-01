import { CommonModule } from "@angular/common";
import {
  Component, ElementRef, OnDestroy, OnInit, ViewChild,
  computed, signal, effect
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import { GameSessionStore } from "../../core/challenge.store";
import { SceneRendererComponent } from "../../shared/scene-renderer/scene-renderer.component";
import type { ServerToClientMessage, SearchTask } from "@birthday/shared";
import { ViewportController } from "./viewport-controller";
import { GestureInterpreter } from "./gesture-interpreter";
import type { Point, Size } from "./types";

/** Canvas internal resolution — always square */
const CANVAS_RES = 300;

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule, FormsModule, SceneRendererComponent],
  templateUrl: "./player.component.html"
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly session: GameSessionStore;

  @ViewChild("drawCanvas") drawCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("avatarCanvas") avatarCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("viewport") viewportRef!: ElementRef<HTMLElement>;

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

  // Search mode
  public readonly viewportController = new ViewportController({ minScale: 0.4, maxScale: 3.0 });
  public readonly sceneWidthPx = 1600;
  public readonly sceneHeightPx = 900;
  private gesture: GestureInterpreter;

  public readonly searchFeedback = signal<{ text: string; correct: boolean } | null>(null);
  private unsubscribeWs: (() => void) | null = null;
  private playerId: string | null = null;

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
    worldStore: WorldStore,
    sessionStore: GameSessionStore
  ) {
    this.store = worldStore;
    this.session = sessionStore;

    this.gesture = new GestureInterpreter({
      callbacks: {
        onPan: (delta) => this.onPan(delta),
        onPanEnd: (velocity) => this.onPanEnd(velocity),
        onPinch: (center, factor, centerDelta) => this.onPinch(center, factor, centerDelta),
        onTap: () => {},
        onWheelZoom: (clientPoint, factor) => this.onWheelZoom(clientPoint, factor)
      },
      tapMaxDurationMs: 260,
      tapMoveThresholdPx: 14
    });

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
      if (mode === "SEARCH") {
        setTimeout(() => this.centerViewport(), 100);
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
    const checkJoin = setInterval(() => {
      if (this.wsService.status() === "connected") {
        this.wsService.send({ type: "join", kind: "player", playerId: this.playerId ?? undefined });
        clearInterval(checkJoin);
      }
    }, 200);
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) this.unsubscribeWs();
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.viewportController.stopInertia();
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
          if (phase === "DRAW" && this.session.currentMode() !== "DRAW" && this.session.currentTask()?.mode !== "DRAW") {
            // Will be set by assign-task
          }
          if (phase === "SEARCH" && this.session.currentMode() !== "SEARCH" && this.session.currentTask()?.mode !== "SEARCH") {
            // Will be set by assign-task
          }
          if (phase === "PAUSED" || phase === "LOBBY") {
            if (this.session.currentMode() === "DRAW" || this.session.currentMode() === "SEARCH") {
              this.session.currentMode.set("IDLE");
              this.session.clearTask();
            }
          }
        }
        break;

      case "assign-task":
        this.session.setTask(msg.task);
        break;

      case "search-result":
        this.searchFeedback.set({ text: msg.message, correct: msg.correct });
        setTimeout(() => this.searchFeedback.set(null), 2500);
        break;

      case "score-update":
        if (msg.playerId === this.session.playerId()) {
          this.session.showFeedback(`+1 Punkt! ${msg.reason}`, "success");
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
    const canvas = canvasType === "draw" ? this.drawCanvasRef?.nativeElement : this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  public selectColor(color: string): void { this.currentColor.set(color); }

  public submitDrawing(): void {
    const canvas = this.drawCanvasRef?.nativeElement;
    if (!canvas) return;
    this.wsService.send({ type: "submit-drawing", imageDataUrl: canvas.toDataURL("image/png") });
    // Will get next task via assign-task
  }

  // ──────── Search ────────

  public get currentSearchTask(): SearchTask | null {
    const task = this.session.currentTask();
    return task?.mode === "SEARCH" ? task : null;
  }

  public takeSnapshot(): void {
    if (this.session.currentMode() !== "SEARCH" || !this.viewportRef) return;
    const vpRect = this.viewportRef.nativeElement.getBoundingClientRect();
    const scale = this.viewportController.scale();
    const viewfinderDiameterPx = Math.min(vpRect.width, vpRect.height) * 0.5;
    const viewfinderRadiusPx = viewfinderDiameterPx / 2;
    const contentCenter = this.viewportController.viewportToContentPoint({
      viewportPoint: { x: vpRect.width / 2, y: vpRect.height / 2 }
    });
    this.wsService.send({
      type: "search-snapshot",
      centerX: contentCenter.x / this.sceneWidthPx,
      centerY: contentCenter.y / this.sceneHeightPx,
      radius: (viewfinderRadiusPx / scale) / this.sceneWidthPx
    });
  }

  public contentTransform(): string { return this.viewportController.contentTransform(); }

  public centerViewport(): void {
    if (!this.viewportRef) return;
    this.viewportController.center({ viewportSize: this.getViewportSize(), sceneSize: this.sceneSize() });
  }

  // ──────── Gesture bindings ────────

  public onViewportPointerDown(e: PointerEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    this.viewportController.stopInertia();
    this.viewportRef.nativeElement.setPointerCapture(e.pointerId);
    this.gesture.onPointerDown(e);
  }
  public onViewportPointerMove(e: PointerEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    this.gesture.onPointerMove(e);
  }
  public onViewportPointerUp(e: PointerEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    this.gesture.onPointerUp(e);
  }
  public onViewportWheel(e: WheelEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    e.preventDefault();
    this.viewportController.stopInertia();
    this.gesture.onWheel(e);
  }

  private onPan(delta: Point): void {
    this.viewportController.panBy({ deltaX: delta.x, deltaY: delta.y, viewportSize: this.getViewportSize(), sceneSize: this.sceneSize() });
  }
  private onPanEnd(velocity: Point): void {
    this.viewportController.setPanVelocityPxPerMs(velocity);
    this.viewportController.startInertia({ viewportSize: this.getViewportSize(), sceneSize: this.sceneSize() });
  }
  private onPinch(center: Point, factor: number, centerDelta: Point): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const vs = { width: rect.width, height: rect.height };
    this.viewportController.panBy({ deltaX: centerDelta.x, deltaY: centerDelta.y, viewportSize: vs, sceneSize: this.sceneSize() });
    this.viewportController.zoomAtPoint({ viewportPoint: { x: center.x - rect.left, y: center.y - rect.top }, factor, viewportSize: vs, sceneSize: this.sceneSize() });
  }
  private onWheelZoom(clientPoint: Point, factor: number): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    this.viewportController.zoomAtPoint({
      viewportPoint: { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top },
      factor, viewportSize: { width: rect.width, height: rect.height }, sceneSize: this.sceneSize()
    });
  }

  private sceneSize(): Size { return { width: this.sceneWidthPx, height: this.sceneHeightPx }; }
  private getViewportSize(): Size {
    if (!this.viewportRef) return { width: 400, height: 400 };
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
