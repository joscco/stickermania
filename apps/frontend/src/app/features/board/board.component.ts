import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, signal, computed } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { WebSocketService } from "../../core/websocket.service";
import { ApiService } from "../../core/api.service";
import { WorldStore } from "../../core/world.store";
import * as QRCode from "qrcode";

import { EventToastsComponent, type UiEvent } from "./events/event-toasts.component";
import { AdminOverlayComponent } from "./admin/admin.component";
import { BoardSetupDrawerComponent } from "./setup/board-setup-drawer.component";
import { BoardSceneComponent } from "./scene/board-scene.component";
import type { ServerToClientMessage, RoundPhase } from "@birthday/shared";
import { ActivatedRoute, Router } from "@angular/router";
import {Subscription} from 'rxjs';
import { environment } from "../../../environments/environment";


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
    BoardSceneComponent,
  ],
  templateUrl: "./board.component.html",
})
export class BoardComponent implements OnInit, OnDestroy {
  public readonly store: WorldStore;
  private routeSubscription: Subscription | null = null;

  public readonly isPartyMode = environment.appMode === "party";

  public readonly playerUrl = signal<string>("");
  public readonly playerQrDataUrl = signal<string | null>(null);

  public readonly showAdminOverlay = signal<boolean>(false);
  public readonly adminErrorText = signal<string | null>(null);
  private adminKey: string | null = null;

  public readonly events = signal<UiEvent[]>([]);
  public readonly wifiQrDataUrl = signal<string | null>(null);
  public readonly showSetupDrawer = signal<boolean>(false);


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

  private unsubscribeWs: (() => void) | null = null;
  private sessionId: string | null = null;

  public readonly isBootstrapping = signal<boolean>(true);
  public readonly isCreatingSession = signal<boolean>(false);
  public readonly existingSessionCodeInput = signal<string>("");
  public readonly sessionCode = signal<string | null>(null);
  public readonly isBoardReady = signal<boolean>(false);
  public readonly bootErrorText = signal<string | null>(null);

  public constructor(
    private readonly wsService: WebSocketService,
    private readonly apiService: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    worldStore: WorldStore,
  ) {
    this.store = worldStore;

    this.adminKey = this.loadAdminKey();
    this.showAdminOverlay = signal<boolean>(!this.adminKey);
  }

  public onWifiQrGenerated(dataUrl: string): void {
    this.wifiQrDataUrl.set((dataUrl ?? "").trim() || null);
  }

  public ngOnInit(): void {
    this.store.setConnecting();

    this.routeSubscription = this.route.paramMap.subscribe(async (paramMap) => {
      const routeSessionCode = paramMap.get("sessionCode");

      this.cleanupBoardRuntime();

      if (!routeSessionCode) {
        this.sessionId = null;
        this.sessionCode.set(null);
        this.playerUrl.set("");
        this.playerQrDataUrl.set(null);
        this.isBootstrapping.set(false);
        this.isBoardReady.set(false);
        this.bootErrorText.set(null);
        return;
      }

      await this.bootstrapBoardSession(routeSessionCode);
    });
  }

  public async createNewSession(): Promise<void> {
    this.isCreatingSession.set(true);
    this.bootErrorText.set(null);

    try {
      const createdSession = await this.apiService.createSession();
      await this.router.navigate(["/board", createdSession.sessionCode]);
    } catch {
      this.bootErrorText.set("Session konnte nicht erstellt werden.");
    } finally {
      this.isCreatingSession.set(false);
    }
  }

  public onExistingSessionCodeInput(rawValue: string): void {
    const normalizedValue = rawValue
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, "")
      .slice(0, 5);

    this.existingSessionCodeInput.set(normalizedValue);
  }

  public async openExistingSession(): Promise<void> {
    const sessionCode = this.existingSessionCodeInput();

    if (sessionCode.length < 4) {
      return;
    }

    await this.router.navigate(["/board", sessionCode]);
  }

  private async bootstrapBoardSession(sessionCode: string): Promise<void> {
    this.isBootstrapping.set(true);
    this.bootErrorText.set(null);

    try {
      const resolvedSession = await this.apiService.resolveSessionByCode(sessionCode.toUpperCase());

      this.sessionId = resolvedSession.sessionId;
      this.sessionCode.set(resolvedSession.sessionCode);

      const playerPageUrl = `${window.location.origin}/#/player?session=${encodeURIComponent(resolvedSession.sessionCode)}`;
      this.playerUrl.set(playerPageUrl);
      this.playerQrDataUrl.set(await QRCode.toDataURL(playerPageUrl, { margin: 1, scale: 6 }));

      this.startTimerTick();

      this.wsService.connect();
      this.unsubscribeWs = this.wsService.onMessage((msg) => this.handleMessage(msg));

      const joinCheckInterval = setInterval(() => {
        if (this.wsService.status() === "connected" && this.sessionId) {
          this.wsService.send({ type: "join", kind: "board", sessionId: this.sessionId });
          clearInterval(joinCheckInterval);
        }
      }, 200);

      this.isBoardReady.set(true);
    } catch {
      this.bootErrorText.set("Session wurde nicht gefunden oder ist abgelaufen.");
      this.isBoardReady.set(false);
    } finally {
      this.isBootstrapping.set(false);
    }
  }

  public ngOnDestroy(): void {
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
      this.routeSubscription = null;
    }
    this.cleanupBoardRuntime();
  }

  private cleanupBoardRuntime(): void {
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
      this.unsubscribeWs = null;
    }

    this.wsService.disconnect();

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.isBoardReady.set(false);
  }

  // ──────── WebSocket ────────

  private handleMessage(msg: ServerToClientMessage): void {
    switch (msg.type) {
      case "welcome":
        this.store.setConnected();
        this.store.setFieldConfig({
          imageSizePx: msg.imageSizePx,
          fieldBaseSize: msg.fieldBaseSize,
          fieldGrowthPerDrawing: msg.fieldGrowthPerDrawing,
          fieldMaxSize: msg.fieldMaxSize,
        });
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
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

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
    if (this.sessionId) {
      this.wsService.send({ type: "reset" });
    }
    this.pushEvent("Spiel zurückgesetzt! 🔄", Date.now());
  }

  public async deleteSession(): Promise<void> {
    if (!this.sessionId) return;
    if (!confirm("Session wirklich löschen? Alle Spieler werden getrennt und alle Daten gehen verloren.")) return;

    try {
      await this.apiService.deleteSession(this.sessionId);
      this.cleanupBoardRuntime();
      await this.router.navigate(["/board"]);
    } catch {
      this.pushEvent("Session konnte nicht gelöscht werden. ❌", Date.now());
    }
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
