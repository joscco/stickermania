import { CommonModule } from "@angular/common";
import { Component, OnDestroy, OnInit, computed, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import type {
  DrawSearchServerEvent,
  GameModeId,
  GardenServerEvent,
  ServerToClientMessage,
  TeamGraffitiServerEvent,
} from "@birthday/shared";
import * as QRCode from "qrcode";
import { Subscription } from "rxjs";
import { ApiService } from "../../core/api.service";
import { WebSocketService } from "../../core/websocket.service";
import { WorldStore } from "../../core/world.store";
import { EventToastsComponent, type UiEvent } from "./events/event-toasts.component";
import { BoardLobbyComponent } from "./lobby/board-lobby.component";
import { BoardSidebarComponent } from "./sidebar/board-sidebar.component";
import { BoardSetupDrawerComponent } from "./setup/board-setup-drawer.component";
import {MuseumSceneComponent} from '../museum-game/board/museum-scene.component';
import {GardenSceneComponent} from '../garden-game/board/garden-scene.component';
import {GraffitiSceneComponent} from '../graffiti-game/board/graffiti-scene.component';

const EVENT_TOAST_DURATION_MS = 3000;

@Component({
  selector: "app-board",
  standalone: true,
  imports: [CommonModule, EventToastsComponent, BoardLobbyComponent, MuseumSceneComponent, GardenSceneComponent, GraffitiSceneComponent, BoardSidebarComponent, BoardSetupDrawerComponent],
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
  public readonly drawDurationSec = signal<number>(60);
  public readonly searchDurationSec = signal<number>(90);

  private sessionId: string | null = null;
  private routeSubscription: Subscription | null = null;
  private unsubscribeWs: (() => void) | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public readonly activeMode = computed<GameModeId>(() => this.worldStore.activeMode());
  public readonly modeLabel = computed(() => {
    switch (this.activeMode()) {
      case "draw-search": return "Künstler & Kenner";
      case "garden-coop": return "Gemeinschaftsgarten";
      case "team-graffiti": return "Team-Graffiti";
      default: return this.activeMode();
    }
  });
  public readonly leaderboard = computed(() => this.worldStore.leaderboard());
  public readonly allPlayers = computed(() => this.worldStore.allPlayers());
  public readonly drawingCount = computed(() => this.worldStore.drawingsList().length);
  public readonly roundPhase = computed(() => this.worldStore.round()?.phase ?? "LOBBY");
  public readonly roundEndsAt = computed(() => {
    if (this.activeMode() === "draw-search") {
      return this.worldStore.round()?.endsAt ?? 0;
    }

    if (this.activeMode() === "team-graffiti") {
      return this.worldStore.teamGraffitiModeState()?.roundEndsAt ?? 0;
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
    this.worldStore.setConnecting();

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

  public saveDrawSearchTimerSettings(): void {
    this.wsService.send({
      type: "game-action",
      mode: "draw-search",
      action: {
        type: "set-timer",
        drawDurationSec: this.drawDurationSec(),
        searchDurationSec: this.searchDurationSec(),
      },
    });
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
      this.wsService.connect();
      this.unsubscribeWs = this.wsService.onMessage((message) => this.handleMessage(message));

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
        this.worldStore.setConnected();
        break;
      }

      case "session-state": {
        this.worldStore.setSessionState(message.state);
        this.worldStore.setConnected();

        if (message.state.activeMode === "draw-search") {
          const drawSearchModeState = message.state.modeState as any;
          this.drawDurationSec.set(drawSearchModeState.round?.drawDurationSec ?? 60);
          this.searchDurationSec.set(drawSearchModeState.round?.searchDurationSec ?? 90);
        }
        break;
      }

      case "session-event": {
        this.pushEvent(message.text, message.createdAt);
        break;
      }

      case "game-event": {
        if (message.mode === "draw-search") {
          this.handleDrawSearchEvent(message.event);
        } else if (message.mode === "garden-coop") {
          this.handleGardenEvent(message.event);
        } else if (message.mode === "team-graffiti") {
          this.handleTeamGraffitiEvent(message.event);
        }
        break;
      }

      case "error": {
        this.pushEvent(message.message, Date.now());
        break;
      }
    }
  }

  private handleDrawSearchEvent(event: DrawSearchServerEvent): void {
    switch (event.type) {
      case "score-update": {
        const playerName = this.worldStore.players()[event.playerId]?.name || "Jemand";
        this.pushEvent(`⭐ ${playerName} ${event.reason} (${event.newScore} Punkte)`, Date.now());
        break;
      }

      case "round-phase": {
        this.pushEvent(event.phase === "ACTIVE" ? "Spiel gestartet! 🎨" : event.phase === "PAUSED" ? "Spiel pausiert." : "Lobby.", Date.now());
        break;
      }

      case "draw-search-config": {
        this.worldStore.setFieldConfig({
          imageSizePx: event.imageSizePx,
          fieldBaseSize: event.fieldBaseSize,
          fieldGrowthPerDrawing: event.fieldGrowthPerDrawing,
          fieldMaxSize: event.fieldMaxSize,
          maxDrawingsPerRound: event.maxDrawingsPerRound,
          searchOverscroll: event.searchOverscroll,
        });
        break;
      }

      case "assign-task":
      case "search-result":
      case "player-phase": {
        break;
      }
    }
  }

  private handleGardenEvent(event: GardenServerEvent): void {
    switch (event.type) {
      case "garden-level-up": {
        this.pushEvent(`🌱 Garten-Level ${event.newLevel} erreicht.`, Date.now());
        break;
      }

      case "garden-plot-ready": {
        this.pushEvent(`🧺 Plot ${event.plotId} ist erntereif.`, Date.now());
        break;
      }

      case "garden-plot-needs-water": {
        this.pushEvent(`💧 Plot ${event.plotId} braucht Wasser.`, Date.now());
        break;
      }

      case "garden-pest-spawned": {
        this.pushEvent(`🐛 Ungeziefer auf ${event.plotId}.`, Date.now());
        break;
      }

      case "garden-order-fulfilled": {
        this.pushEvent(`📦 Auftrag erfüllt (+${event.experienceGained} XP).`, Date.now());
        break;
      }
    }
  }

  private handleTeamGraffitiEvent(event: TeamGraffitiServerEvent): void {
    switch (event.type) {
      case "team-assigned": {
        const playerName = this.worldStore.players()[event.playerId]?.name || "Jemand";
        this.pushEvent(`${playerName} ist jetzt Team ${event.teamId}.`, Date.now());
        break;
      }

      case "tag-placed": {
        this.pushEvent(`🎨 Neues Tag auf ${event.buildingId}.`, Date.now());
        break;
      }

      case "tag-removed": {
        this.pushEvent(`🧽 Tag entfernt (+${event.scoreAwarded} Punkte).`, Date.now());
        break;
      }

      case "team-score-updated": {
        this.pushEvent(`🏁 Team ${event.teamId} hat jetzt ${event.newScore} Punkte.`, Date.now());
        break;
      }
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
