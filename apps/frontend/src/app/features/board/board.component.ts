import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal, computed, effect } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import * as QRCode from "qrcode";

import { EventToastsComponent, type UiEvent } from "./events/event-toasts.component";
import { AdminOverlayComponent } from "./admin/admin.component";
import { BoardSetupDrawerComponent } from "./setup/board-setup-drawer.component";
import { SceneRendererComponent } from "../../shared/scene-renderer/scene-renderer.component";
import type { ServerToClientMessage, RoundPhase } from "@birthday/shared";

/** How long an event toast stays visible */
const EVENT_TOAST_DURATION_MS = 3000;

@Component({
  selector: "app-board",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EventToastsComponent,
    AdminOverlayComponent,
    BoardSetupDrawerComponent,
    SceneRendererComponent,
  ],
  templateUrl: "./board.component.html",
})
export class BoardComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;

  public readonly playerUrl = signal<string>("");
  public readonly playerQrDataUrl = signal<string | null>(null);

  public readonly showAdminOverlay = signal<boolean>(false);
  public readonly adminErrorText = signal<string | null>(null);
  private adminKey: string | null = null;

  public readonly events = signal<UiEvent[]>([]);
  public readonly wifiQrDataUrl = signal<string | null>(null);
  public readonly showSetupDrawer = signal<boolean>(false);

  @ViewChild("sceneHost", { static: true })
  private sceneHostRef!: ElementRef<HTMLElement>;

  public readonly boardScale = signal<number>(1);
  private resizeObserver: ResizeObserver | null = null;

  public readonly sceneWidthPx = signal<number>(600);
  public readonly sceneHeightPx = signal<number>(600);


  public readonly leaderboard = computed(() => this.store.leaderboard());
  public readonly drawingCount = computed(() => this.store.drawingsList().length);
  public readonly playerCount = computed(() => this.store.leaderboard().length);

  public readonly roundPhase = computed<RoundPhase>(() => this.store.round()?.phase ?? "LOBBY");
  public readonly roundEndsAt = computed(() => this.store.round()?.endsAt ?? 0);
  public readonly roundNumber = computed(() => this.store.round()?.roundNumber ?? 0);

  /** Timer countdown display */
  public readonly timeLeft = signal<string>("");
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  /** Timer settings (editable) */
  public drawDurationSec = signal<number>(60);
  public searchDurationSec = signal<number>(90);

  private recomputeScale: (() => void) | null = null;
  private unsubscribeWs: (() => void) | null = null;

  public constructor(
    private readonly wsService: WebSocketService,
    worldStore: WorldStore,
  ) {
    this.store = worldStore;

    // Load admin key early so the overlay state is correct on first render
    this.adminKey = this.loadAdminKey();
    this.showAdminOverlay = signal<boolean>(!this.adminKey);

    // Recompute board size whenever drawing count changes
    effect(() => {
      this.drawingCount();
      this.recomputeScale?.();
    });
  }

  public onWifiQrGenerated(dataUrl: string): void {
    this.wifiQrDataUrl.set((dataUrl ?? "").trim() || null);
  }

  public async ngOnInit(): Promise<void> {
    this.store.setConnecting();

    const host = window.location.host;
    const playerPageUrl = `http://${host}/#/player`;
    this.playerUrl.set(playerPageUrl);
    this.playerQrDataUrl.set(await QRCode.toDataURL(playerPageUrl, { margin: 1, scale: 6 }));

    this.setupAutoScale();
    this.startTimerTick();

    this.wsService.connect();
    this.unsubscribeWs = this.wsService.onMessage((msg) => this.handleMessage(msg));

    const joinCheckInterval = setInterval(() => {
      if (this.wsService.status() === "connected") {
        this.wsService.send({ type: "join", kind: "board" });
        clearInterval(joinCheckInterval);
      }
    }, 200);
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // ──────── WebSocket ────────

  private handleMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case "welcome":
        this.store.setConnected();
        break;

      case "state":
        this.store.setGameState(msg.state);
        this.store.setConnected();
        if (msg.state.round) {
          this.drawDurationSec.set(msg.state.round.drawDurationSec);
          this.searchDurationSec.set(msg.state.round.searchDurationSec);
        }
        break;

      case "event":
        this.pushEvent(msg.text, msg.createdAt);
        break;

      case "score-update": {
        const playerName = this.store.players()[msg.playerId]?.name || "Jemand";
        this.pushEvent(`⭐ ${playerName} ${msg.reason} (${msg.newScore} Punkte)`, Date.now());
        break;
      }
    }
  }

  // ──────── Round controls ────────

  public startRound(): void {
    this.wsService.send({ type: "start-round" });
  }

  public saveTimerSettings(): void {
    this.wsService.send({
      type: "set-timer",
      drawDurationSec: this.drawDurationSec(),
      searchDurationSec: this.searchDurationSec(),
    });
  }

  private startTimerTick(): void {
    this.timerInterval = setInterval(() => {
      const endsAt = this.roundEndsAt();
      if (endsAt > 0) {
        const remainingMs = Math.max(0, endsAt - Date.now());
        const totalSeconds = Math.ceil(remainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        this.timeLeft.set(`${minutes}:${String(seconds).padStart(2, "0")}`);
      } else {
        this.timeLeft.set("");
      }
    }, 500);
  }

  public get phaseLabel(): string {
    switch (this.roundPhase()) {
      case "DRAW": return "Zeichnen";
      case "SEARCH": return "Suchen";
      case "PAUSED": return "Pause";
      default: return "Lobby";
    }
  }

  public get phaseIcon(): string {
    switch (this.roundPhase()) {
      case "DRAW": return "assets/icons/paintbrush.svg";
      case "SEARCH": return "assets/icons/search.svg";
      case "PAUSED": return "assets/icons/pause.svg";
      default: return "assets/icons/home.svg";
    }
  }

  // ──────── Setup / Admin ────────

  public toggleSetupDrawer(): void {
    this.showSetupDrawer.set(!this.showSetupDrawer());
  }

  public onSetupDrawerCloseRequested(): void {
    this.showSetupDrawer.set(false);
  }

  public resetWorld(): void {
    this.wsService.send({ type: "reset" });
    this.pushEvent("Spiel zurückgesetzt! 🔄", Date.now());
  }

  public canReset(): boolean {
    return (this.adminKey ?? "").trim().length > 0;
  }

  public onAdminKeySubmitted(adminKey: string): void {
    this.adminKey = adminKey;
    localStorage.setItem("birthday_admin_key", adminKey);
    this.adminErrorText.set(null);
    this.showAdminOverlay.set(false);
  }

  // ──────── Auto-scale ────────

  private setupAutoScale(): void {
    const hostElement = this.sceneHostRef.nativeElement;

    const recompute = () => {
      const hostRect = hostElement.getBoundingClientRect();
      const maxDiameter = Math.min(hostRect.width, hostRect.height);

      // The effective field size from the server grows with the number of drawings.
      const efw = this.store.gameState()?.effectiveFieldWidth ?? 400;

      // The scene uses the effective field size as its logical pixel dimension.
      this.sceneWidthPx.set(efw);
      this.sceneHeightPx.set(efw);

      // When the field is small (few drawings) the circle is small on screen.
      // When the field grows beyond the available space, scale it down to fit.
      this.boardScale.set(Math.min(1, maxDiameter / efw));
    };

    this.recomputeScale = recompute;
    this.resizeObserver = new ResizeObserver(() => recompute());
    this.resizeObserver.observe(hostElement);
    recompute();
  }

  // ──────── Events ────────

  private pushEvent(text: string, createdAt: number): void {
    const id = `${createdAt}-${Math.random().toString(16).slice(2)}`;
    const event: UiEvent = { id, text, createdAt };
    this.events.set([event, ...this.events()]);
    setTimeout(() => {
      this.events.set(this.events().filter((e) => e.id !== id));
    }, EVENT_TOAST_DURATION_MS);
  }

  private loadAdminKey(): string | null {
    const stored = localStorage.getItem("birthday_admin_key");
    if (!stored || stored.trim().length === 0) {
      return null;
    }
    return stored.trim();
  }
}
