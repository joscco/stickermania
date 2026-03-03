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

@Component({
  selector: "app-board",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EventToastsComponent,
    AdminOverlayComponent,
    BoardSetupDrawerComponent,
    SceneRendererComponent
  ],
  templateUrl: "./board.component.html"
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
    worldStore: WorldStore
  ) {
    this.store = worldStore;

    // Recompute board scale when scene dimensions change
    effect(() => {
      this.sceneWidthPx();
      this.sceneHeightPx();
      this.recomputeScale?.();
    });
  }

  public onWifiQrGenerated(dataUrl: string): void {
    this.wifiQrDataUrl.set((dataUrl ?? "").trim() || null);
  }

  public async ngOnInit(): Promise<void> {
    this.store.setConnecting();

    const host: string = window.location.host;
    const playerUrl: string = `http://${host}/#/player`;
    this.playerUrl.set(playerUrl);
    this.playerQrDataUrl.set(await QRCode.toDataURL(playerUrl, { margin: 1, scale: 6 }));

    this.adminKey = this.loadAdminKey();
    this.showAdminOverlay.set(!this.adminKey);
    this.setupAutoScale();
    this.startTimerTick();

    this.wsService.connect();
    this.unsubscribeWs = this.wsService.onMessage((msg) => this.handleMessage(msg));

    // Send initial join once WS is open (wsService will auto-re-send on reconnect)
    const checkJoin = setInterval(() => {
      if (this.wsService.status() === "connected") {
        this.wsService.send({ type: "join", kind: "board" });
        clearInterval(checkJoin);
      }
    }, 200);
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) this.unsubscribeWs();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private handleMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case "welcome":
        this.store.setConnected();
        break;

      case "state":
        this.store.setGameState(msg.state);
        this.store.setConnected();
        // Sync timer settings from server
        if (msg.state.round) {
          this.drawDurationSec.set(msg.state.round.drawDurationSec);
          this.searchDurationSec.set(msg.state.round.searchDurationSec);
        }
        break;

      case "event":
        this.pushEvent(msg.text, msg.createdAt);
        break;

      case "score-update": {
        const player = this.store.players()[msg.playerId];
        const name = player?.name || "Jemand";
        this.pushEvent(`⭐ ${name} ${msg.reason} (${msg.newScore} Punkte)`, Date.now());
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
      searchDurationSec: this.searchDurationSec()
    });
  }

  private startTimerTick(): void {
    this.timerInterval = setInterval(() => {
      const endsAt = this.roundEndsAt();
      if (endsAt > 0) {
        const left = Math.max(0, endsAt - Date.now());
        const sec = Math.ceil(left / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        this.timeLeft.set(`${m}:${String(s).padStart(2, "0")}`);
      } else {
        this.timeLeft.set("");
      }
    }, 500);
  }

  public get phaseLabel(): string {
    switch (this.roundPhase()) {
      case "DRAW": return "🖌 Zeichnen";
      case "SEARCH": return "🔍 Suchen";
      case "PAUSED": return "⏸ Pause";
      default: return "🏠 Lobby";
    }
  }

  // ──────── existing methods ────────

  public toggleSetupDrawer(): void { this.showSetupDrawer.set(!this.showSetupDrawer()); }
  public onSetupDrawerCloseRequested(): void { this.showSetupDrawer.set(false); }

  public resetWorld(): void {
    this.wsService.send({ type: "reset" });
    this.pushEvent("Spiel zurückgesetzt! 🔄", Date.now());
  }

  public canReset(): boolean { return (this.adminKey ?? "").trim().length > 0; }

  public onAdminKeySubmitted(adminKey: string): void {
    this.adminKey = adminKey;
    localStorage.setItem("birthday_admin_key", adminKey);
    this.adminErrorText.set(null);
    this.showAdminOverlay.set(false);
  }

  private setupAutoScale(): void {
    const hostElement = this.sceneHostRef.nativeElement;
    const recompute = () => {
      const hostRect = hostElement.getBoundingClientRect();
      // The scene fills the container as a circle — use min dimension as the diameter
      const diameter = Math.min(hostRect.width, hostRect.height);
      this.sceneWidthPx.set(diameter);
      this.sceneHeightPx.set(diameter);
      // Scale is always 1 since the scene IS the container size
      this.boardScale.set(1);
    };
    this.recomputeScale = recompute;
    this.resizeObserver = new ResizeObserver(() => recompute());
    this.resizeObserver.observe(hostElement);
    recompute();
  }

  private pushEvent(text: string, createdAt: number): void {
    const id: string = `${createdAt}-${Math.random().toString(16).slice(2)}`;
    const next: UiEvent = { id, text, createdAt };
    this.events.set([next, ...this.events()]);
    window.setTimeout(() => { this.events.set(this.events().filter((e) => e.id !== id)); }, 4000);
  }

  private loadAdminKey(): string | null {
    const stored = localStorage.getItem("birthday_admin_key");
    if (!stored) return null;
    return stored.trim().length > 0 ? stored.trim() : null;
  }
}
