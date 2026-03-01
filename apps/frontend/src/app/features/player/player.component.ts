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

@Component({
  selector: "app-player",
  standalone: true,
  imports: [CommonModule, FormsModule, SceneRendererComponent],
  templateUrl: "./player.component.html"
})
export class PlayerComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  public readonly session: GameSessionStore;

  // Canvas drawing state
  @ViewChild("drawCanvas") drawCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("avatarCanvas") avatarCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("viewport") viewportRef!: ElementRef<HTMLElement>;

  public readonly nameInput = signal<string>("");

  // Drawing tools
  public readonly currentColor = signal<string>("#1c1917");
  public readonly brushSize = signal<number>(4);
  public readonly colors = ["#1c1917", "#dc2626", "#2563eb", "#16a34a", "#eab308", "#9333ea", "#f97316", "#ffffff"];

  private isDrawing = false;
  private lastDrawPoint: { x: number; y: number } | null = null;
  private avatarCanvasInitialized = false;
  private drawCanvasInitialized = false;

  // Search mode - viewport
  public readonly viewportController = new ViewportController({ minScale: 0.4, maxScale: 3.0 });
  public readonly sceneWidthPx = 1600;
  public readonly sceneHeightPx = 900;
  private gesture: GestureInterpreter;

  // Search feedback
  public readonly searchFeedback = signal<{ text: string; correct: boolean } | null>(null);

  private unsubscribeWs: (() => void) | null = null;
  private playerId: string | null = null;

  // Leaderboard for lobby
  public readonly leaderboard = computed(() => this.store.leaderboard());

  // Current player score
  public readonly myScore = computed(() => {
    const pid = this.session.playerId();
    if (!pid) return 0;
    return this.store.players()[pid]?.score ?? 0;
  });

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
        onTap: (clientPoint) => this.onSceneTap(clientPoint),
        onWheelZoom: (clientPoint, factor) => this.onWheelZoom(clientPoint, factor)
      },
      tapMaxDurationMs: 260,
      tapMoveThresholdPx: 14
    });

    // Auto-initialize canvases when mode changes
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
  }

  public ngOnInit(): void {
    // Load saved playerId for reconnection
    this.playerId = localStorage.getItem("birthday_player_id") ?? null;

    this.wsService.connect();
    this.unsubscribeWs = this.wsService.onMessage((msg) => this.handleMessage(msg));

    // Join once connected
    const checkJoin = setInterval(() => {
      if (this.wsService.status() === "connected") {
        this.wsService.send({
          type: "join",
          kind: "player",
          playerId: this.playerId ?? undefined
        });
        clearInterval(checkJoin);
      }
    }, 200);
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) this.unsubscribeWs();
    this.viewportController.stopInertia();
  }

  // ──────── WebSocket message handling ────────

  private handleMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case "welcome":
        this.session.setJoined({ playerId: msg.playerId, clientId: msg.clientId });
        this.playerId = msg.playerId;
        localStorage.setItem("birthday_player_id", msg.playerId);

        // Check if player already has a name (reconnection)
        const existingPlayer = this.store.players()[msg.playerId];
        if (existingPlayer?.name) {
          this.session.playerName.set(existingPlayer.name);
          // Don't set LOBBY, let them request a task
        }
        break;

      case "state":
        this.store.setGameState(msg.state);
        this.store.setConnected();

        // If we just got state and player has a name, check mode
        const pid = this.session.playerId();
        if (pid && msg.state.players[pid]?.name) {
          this.session.playerName.set(msg.state.players[pid].name);
          // If in LOBBY and has name, could mean reconnection
          if (this.session.currentMode() === "LOBBY" && msg.state.players[pid].name.length > 0 && msg.state.players[pid].avatarDataUrl) {
            // Player already set up, go to IDLE to request task
            this.session.currentMode.set("IDLE");
          }
        }
        break;

      case "assign-task":
        this.session.setTask(msg.task);
        break;

      case "search-result":
        this.searchFeedback.set({
          text: msg.message,
          correct: msg.correct
        });
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

  // ──────── Lobby: Name + Avatar ────────

  public submitName(): void {
    const name = this.nameInput().trim();
    if (name.length === 0) return;

    this.wsService.send({ type: "set-name", name });
    this.session.playerName.set(name);
    // Move to avatar drawing phase
    this.session.currentMode.set("LOBBY");
  }

  public get isNameSet(): boolean {
    return this.session.playerName().length > 0;
  }

  public get hasAvatar(): boolean {
    const pid = this.session.playerId();
    if (!pid) return false;
    return !!this.store.players()[pid]?.avatarDataUrl;
  }

  public submitAvatar(): void {
    const canvas = this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: dataUrl });

    // Move to idle and request first task
    this.session.currentMode.set("IDLE");
    setTimeout(() => this.requestTask(), 500);
  }

  public initAvatarCanvas(): void {
    if (this.avatarCanvasInitialized) return;
    const canvas = this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    this.avatarCanvasInitialized = true;
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fafaf9";
      ctx.fillRect(0, 0, 200, 200);
    }
  }

  // ──────── Drawing Canvas ────────

  public initDrawCanvas(): void {
    if (this.drawCanvasInitialized) return;
    const canvas = this.drawCanvasRef?.nativeElement;
    if (!canvas) return;
    this.drawCanvasInitialized = true;
    const rect = canvas.parentElement?.getBoundingClientRect();
    canvas.width = rect?.width ?? 360;
    canvas.height = rect?.height ?? 360;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fafaf9";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  public onCanvasPointerDown(event: PointerEvent, canvasType: "draw" | "avatar"): void {
    event.preventDefault();
    const canvas = canvasType === "draw" ? this.drawCanvasRef?.nativeElement : this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    this.lastDrawPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    // Draw a dot at the start
    const ctx = canvas.getContext("2d");
    if (ctx && this.lastDrawPoint) {
      ctx.fillStyle = this.currentColor();
      ctx.beginPath();
      ctx.arc(this.lastDrawPoint.x, this.lastDrawPoint.y, this.brushSize() / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public onCanvasPointerMove(event: PointerEvent, canvasType: "draw" | "avatar"): void {
    if (!this.isDrawing || !this.lastDrawPoint) return;
    event.preventDefault();

    const canvas = canvasType === "draw" ? this.drawCanvasRef?.nativeElement : this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.strokeStyle = this.currentColor();
    ctx.lineWidth = this.brushSize();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(this.lastDrawPoint.x, this.lastDrawPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    this.lastDrawPoint = { x, y };
  }

  public onCanvasPointerUp(event: PointerEvent): void {
    this.isDrawing = false;
    this.lastDrawPoint = null;
  }

  public clearCanvas(canvasType: "draw" | "avatar"): void {
    const canvas = canvasType === "draw" ? this.drawCanvasRef?.nativeElement : this.avatarCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#fafaf9";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  public selectColor(color: string): void {
    this.currentColor.set(color);
  }

  public submitDrawing(): void {
    const canvas = this.drawCanvasRef?.nativeElement;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    this.wsService.send({ type: "submit-drawing", imageDataUrl: dataUrl });

    // Will receive assign-task after server processes
    this.session.currentMode.set("IDLE");
  }

  // ──────── Task management ────────

  public requestTask(): void {
    this.wsService.send({ type: "request-task" });
  }

  public get currentSearchTask(): SearchTask | null {
    const task = this.session.currentTask();
    if (task && task.mode === "SEARCH") return task;
    return null;
  }

  // ──────── Search mode: viewport + scene tapping ────────

  public handleDrawingTapped = (drawingId: string): void => {
    if (this.session.currentMode() !== "SEARCH") return;
    this.wsService.send({ type: "search-tap", drawingId });
  };

  public contentTransform(): string {
    return this.viewportController.contentTransform();
  }

  public centerViewport(): void {
    if (!this.viewportRef) return;
    const viewportSize = this.getViewportSize();
    this.viewportController.center({ viewportSize, sceneSize: this.sceneSize() });
  }

  // ──────── Gesture bindings for search mode ────────

  public onViewportPointerDown(event: PointerEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    this.viewportController.stopInertia();
    this.viewportRef.nativeElement.setPointerCapture(event.pointerId);
    this.gesture.onPointerDown(event);
  }

  public onViewportPointerMove(event: PointerEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    this.gesture.onPointerMove(event);
  }

  public onViewportPointerUp(event: PointerEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    this.gesture.onPointerUp(event);
  }

  public onViewportWheel(event: WheelEvent): void {
    if (this.session.currentMode() !== "SEARCH") return;
    event.preventDefault();
    this.viewportController.stopInertia();
    this.gesture.onWheel(event);
  }

  private onPan(delta: Point): void {
    const viewportSize = this.getViewportSize();
    this.viewportController.panBy({ deltaX: delta.x, deltaY: delta.y, viewportSize, sceneSize: this.sceneSize() });
  }

  private onPanEnd(velocity: Point): void {
    this.viewportController.setPanVelocityPxPerMs(velocity);
    const viewportSize = this.getViewportSize();
    this.viewportController.startInertia({ viewportSize, sceneSize: this.sceneSize() });
  }

  private onPinch(centerClient: Point, factor: number, centerDeltaClient: Point): void {
    const viewportElement = this.viewportRef.nativeElement;
    const rect = viewportElement.getBoundingClientRect();
    const viewportSize = { width: rect.width, height: rect.height };
    this.viewportController.panBy({ deltaX: centerDeltaClient.x, deltaY: centerDeltaClient.y, viewportSize, sceneSize: this.sceneSize() });
    const viewportPoint: Point = { x: centerClient.x - rect.left, y: centerClient.y - rect.top };
    this.viewportController.zoomAtPoint({ viewportPoint, factor, viewportSize, sceneSize: this.sceneSize() });
  }

  private onWheelZoom(clientPoint: Point, factor: number): void {
    const viewportElement = this.viewportRef.nativeElement;
    const rect = viewportElement.getBoundingClientRect();
    const viewportPoint: Point = { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top };
    this.viewportController.zoomAtPoint({
      viewportPoint,
      factor,
      viewportSize: { width: rect.width, height: rect.height },
      sceneSize: this.sceneSize()
    });
  }

  private onSceneTap(clientPoint: Point): void {
    // Tapping is handled by the scene-renderer click events
  }

  private sceneSize(): Size {
    return { width: this.sceneWidthPx, height: this.sceneHeightPx };
  }

  private getViewportSize(): Size {
    if (!this.viewportRef) return { width: 400, height: 400 };
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }
}
