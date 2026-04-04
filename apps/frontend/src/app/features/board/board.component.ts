import {CommonModule} from "@angular/common";
import {Component, computed, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import type {GameModeId, ServerToClientMessage, StickerCollageServerEvent,} from "@birthday/shared";
import * as QRCode from "qrcode";
import {Subscription} from "rxjs";
import {ApiService} from "../../core/api.service";
import {WebSocketService} from "../../core/websocket.service";
import {WorldStore} from "../../core/world.store";
import {EventToastsComponent, type UiEvent} from "./events/event-toasts.component";
import {BoardLobbyComponent} from "./lobby/board-lobby.component";
import {BoardSidebarComponent} from "./sidebar/board-sidebar.component";
import {BoardSetupDrawerComponent} from "./setup/board-setup-drawer.component";
import {StickerBoardSceneComponent} from '../sticker-game/board/sticker-board-scene.component';

const EVENT_TOAST_DURATION_MS = 3000;

@Component({
  selector: "app-board",
  standalone: true,
  imports: [CommonModule, EventToastsComponent, BoardLobbyComponent, StickerBoardSceneComponent, BoardSidebarComponent, BoardSetupDrawerComponent],
  templateUrl: "./board.component.html",
})
export class BoardComponent implements OnInit, OnDestroy {
  public readonly worldStore: WorldStore;

  public readonly playerUrl = signal<string>("");
  public readonly playerQrDataUrl = signal<string | null>(null);
  public readonly wifiQrDataUrl = signal<string | null>(null);
  public readonly isSetupDrawerOpen = signal<boolean>(false);
  public readonly events = signal<UiEvent[]>([]);
  public readonly isBoardReady = signal<boolean>(false);
  public readonly isBootstrapping = signal<boolean>(true);
  public readonly bootErrorText = signal<string | null>(null);
  public readonly sessionCode = signal<string | null>(null);
  public readonly timeLeft = signal<string>("");

  private sessionId: string | null = null;
  private routeSubscription: Subscription | null = null;
  private unsubscribeWs: (() => void) | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public readonly activeMode = computed<GameModeId>(() => this.worldStore.activeMode());
  public readonly modeLabel = computed(() => {
    switch (this.activeMode()) {
      case "sticker-collage": return "Sticker-Collage";
      default: return this.activeMode();
    }
  });
  public readonly leaderboard = computed(() => this.worldStore.leaderboard());
  public readonly allPlayers = computed(() => this.worldStore.allPlayers());
  public readonly roundEndsAt = computed(() => {

    if (this.activeMode() === "sticker-collage") {
      return this.worldStore.stickerCollageModeState()?.roundEndsAt ?? 0;
    }

    return 0;
  });

  public constructor(
    private readonly wsService: WebSocketService,
    private readonly apiService: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    worldStore: WorldStore,
  ) {
    this.worldStore = worldStore;
  }

  public ngOnInit(): void {
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

  public ngOnDestroy(): void {
    if (this.routeSubscription) {
      this.routeSubscription.unsubscribe();
      this.routeSubscription = null;
    }

    this.cleanupBoardRuntime();
  }

  public async onSessionSelected(sessionCode: string): Promise<void> {
    await this.router.navigate(["/board", sessionCode]);
  }


  public toggleSetupDrawer(): void {
    this.isSetupDrawerOpen.set(!this.isSetupDrawerOpen());
  }

  public closeSetupDrawer(): void {
    this.isSetupDrawerOpen.set(false);
  }

  public handleWifiQrGenerated(dataUrl: string): void {
    this.wifiQrDataUrl.set(dataUrl || null);
  }


  public startMode(): void {
    this.wsService.send({ type: "start-mode" });
  }

  public async backToLobby(): Promise<void> {
    this.cleanupBoardRuntime();
    await this.router.navigate(["/board"]);
  }

  public resetSession(): void {
    this.wsService.send({ type: "reset-session" });
    this.pushEvent("Spiel zurückgesetzt. 🔄", Date.now());
  }

  public async deleteSession(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    if (!confirm("Session wirklich löschen? Alle Spieler werden getrennt und alle Daten gehen verloren.")) {
      return;
    }

    try {
      await this.apiService.deleteSession(this.sessionId);
      this.cleanupBoardRuntime();
      await this.router.navigate(["/board"]);
    } catch {
      this.pushEvent("Session konnte nicht gelöscht werden. ❌", Date.now());
    }
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
      this.unsubscribeWs = this.wsService.onMessage((message) => this.handleMessage(message));
      this.wsService.connect();

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

  private cleanupBoardRuntime(): void {
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
      this.unsubscribeWs = null;
    }

    this.wsService.disconnect();
    this.worldStore.clearSessionState();
    this.isSetupDrawerOpen.set(false);
    this.wifiQrDataUrl.set(null);

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.isBoardReady.set(false);
  }

  private handleMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case "welcome": {
        break;
      }

      case "session-state": {
        this.worldStore.setSessionState(message.state);
        break;
      }

      case "session-event": {
        this.pushEvent(message.text, message.createdAt);
        break;
      }

      case "game-event": {
        if (message.mode === "sticker-collage") {
          this.handleStickerCollageEvent(message.event);
        }
        break;
      }

      case "error": {
        this.pushEvent(message.message, Date.now());
        break;
      }
    }
  }

  private handleStickerCollageEvent(event: StickerCollageServerEvent): void {
    switch (event.type) {
      case "round-started": {
        this.pushEvent(`🎨 Neue Runde: ${event.prompt}`, Date.now());
        break;
      }
      case "collage-submitted": {
        const playerName = this.worldStore.players()[event.playerId]?.name || "Jemand";
        this.pushEvent(`🖼️ ${playerName} hat eine Collage eingereicht!`, Date.now());
        break;
      }
      case "round-ended": {
        const top = event.results[0];
        if (top) {
          const winnerName = this.worldStore.players()[top.playerId]?.name || "Jemand";
          this.pushEvent(`🏆 ${winnerName} gewinnt die Runde mit ${top.voteCount} Stimmen!`, Date.now());
        }
        break;
      }
      case "score-update": {
        const playerName = this.worldStore.players()[event.playerId]?.name || "Jemand";
        this.pushEvent(`⭐ ${playerName} hat jetzt ${event.newScore} Punkte.`, Date.now());
        break;
      }
      case "hand-dealt":
      case "vote-registered":
        break;
    }
  }

  private startTimerTick(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.timerInterval = setInterval(() => {
      const endsAt = this.roundEndsAt();

      if (endsAt <= 0) {
        this.timeLeft.set("");
        return;
      }

      const remainingMilliseconds = Math.max(0, endsAt - Date.now());
      const totalSeconds = Math.ceil(remainingMilliseconds / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      this.timeLeft.set(`${minutes}:${String(seconds).padStart(2, "0")}`);
    }, 500);
  }

  private pushEvent(text: string, createdAt: number): void {
    const eventId = `${createdAt}-${Math.random().toString(16).slice(2)}`;
    const uiEvent: UiEvent = { id: eventId, text, createdAt };

    this.events.set([uiEvent, ...this.events()]);

    setTimeout(() => {
      this.events.set(this.events().filter((event) => event.id !== eventId));
    }, EVENT_TOAST_DURATION_MS);
  }
}
