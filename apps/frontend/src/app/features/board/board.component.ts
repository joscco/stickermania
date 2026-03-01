import { CommonModule } from "@angular/common";
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal, computed } from "@angular/core";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import * as QRCode from "qrcode";

import { EventToastsComponent, type UiEvent } from "./events/event-toasts.component";
import { AdminOverlayComponent } from "./admin/admin.component";
import { BoardSetupDrawerComponent } from "./setup/board-setup-drawer.component";
import { SceneRendererComponent } from "../../shared/scene-renderer/scene-renderer.component";
import type { ServerToClientMessage } from "@birthday/shared";

@Component({
  selector: "app-board",
  standalone: true,
  imports: [
    CommonModule,
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

  // --- autoscale for renderer ---
  @ViewChild("sceneHost", { static: true })
  private sceneHostRef!: ElementRef<HTMLElement>;

  public readonly boardScale = signal<number>(1);
  private resizeObserver: ResizeObserver | null = null;

  public readonly sceneWidthPx: number = 1600;
  public readonly sceneHeightPx: number = 900;

  public readonly leaderboard = computed(() => this.store.leaderboard());
  public readonly drawingCount = computed(() => this.store.drawingsList().length);
  public readonly playerCount = computed(() => this.store.leaderboard().length);

  private unsubscribeWs: (() => void) | null = null;

  public constructor(
    private readonly wsService: WebSocketService,
    worldStore: WorldStore
  ) {
    this.store = worldStore;
  }

  public onWifiQrGenerated(dataUrl: string): void {
    const trimmed: string = (dataUrl ?? "").trim();
    this.wifiQrDataUrl.set(trimmed.length > 0 ? trimmed : null);
  }

  public async ngOnInit(): Promise<void> {
    this.store.setConnecting();

    // Player URL/QR
    const host: string = window.location.host;
    const playerUrl: string = `http://${host}/#/player`;
    this.playerUrl.set(playerUrl);
    this.playerQrDataUrl.set(await QRCode.toDataURL(playerUrl, { margin: 1, scale: 6 }));

    this.adminKey = this.loadAdminKey();
    this.showAdminOverlay.set(!this.adminKey);

    this.setupAutoScale();

    // Connect via WebSocket
    this.wsService.connect();
    this.unsubscribeWs = this.wsService.onMessage((msg) => this.handleMessage(msg));

    // Join as board
    const checkJoin = setInterval(() => {
      if (this.wsService.status() === "connected") {
        this.wsService.send({ type: "join", kind: "board" });
        clearInterval(checkJoin);
      }
    }, 200);
  }

  public ngOnDestroy(): void {
    if (this.unsubscribeWs) this.unsubscribeWs();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private handleMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case "welcome":
        this.store.setConnected();
        break;

      case "state":
        this.store.setGameState(msg.state);
        this.store.setConnected();
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

  // ---------- autoscale ----------
  private setupAutoScale(): void {
    const hostElement = this.sceneHostRef.nativeElement;

    const recompute = () => {
      const hostRect = hostElement.getBoundingClientRect();
      const scaleByWidth = hostRect.width / this.sceneWidthPx;
      const scaleByHeight = hostRect.height / this.sceneHeightPx;
      const clampedScale = Math.min(2.5, Math.max(0.4, Math.min(scaleByWidth, scaleByHeight)));
      this.boardScale.set(clampedScale);
    };

    this.resizeObserver = new ResizeObserver(() => recompute());
    this.resizeObserver.observe(hostElement);

    recompute();
  }

  // ---------- UI events ----------
  private pushEvent(text: string, createdAt: number): void {
    const id: string = `${createdAt}-${Math.random().toString(16).slice(2)}`;
    const next: UiEvent = { id, text, createdAt };
    this.events.set([next, ...this.events()]);
    window.setTimeout(() => {
      this.events.set(this.events().filter((e) => e.id !== id));
    }, 4000);
  }

  private loadAdminKey(): string | null {
    const stored: string | null = localStorage.getItem("birthday_admin_key");
    if (!stored) return null;
    const trimmed: string = stored.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
