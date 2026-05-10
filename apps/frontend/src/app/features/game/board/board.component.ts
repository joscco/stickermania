import {CommonModule} from "@angular/common";
import {Component, computed, input, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import type {StickerCollageClientAction, ServerToClientMessage, SessionPlayer} from "@birthday/shared";
import * as QRCode from "qrcode";
import {Subscription} from "rxjs";
import {BoardLobbyComponent} from './board-lobby.component';
import {BoardSetupDrawerComponent} from './setup-drawer/board-setup-drawer.component';
import {BoardLobbySceneComponent} from './scenes/lobby/board-lobby-scene.component';
import {BoardBuildingSceneComponent} from './scenes/building/board-building-scene.component';
import {BoardVotingSceneComponent} from './scenes/voting/board-voting-scene.component';
import {BoardResultsSceneComponent} from './scenes/results/board-results-scene.component';
import {BoardQrPanelComponent} from './qr-panel/board-qr-panel.component';
import {AnimOnInitDirective} from '../../shared/animations/anim-on-init.directive';
import {SvgComponent} from '../../shared/svg/svg.component';
import {WebSocketService} from '../../../core/websocket.service';
import {ApiService} from '../../../core/api.service';
import {WorldStore} from '../../../core/world.store';
import {BoardScreen} from '../player/player-screen.enum';

@Component({
  selector: "app-board",
  standalone: true,
  imports: [CommonModule, BoardLobbyComponent, BoardSetupDrawerComponent, BoardLobbySceneComponent, BoardBuildingSceneComponent, BoardVotingSceneComponent, BoardResultsSceneComponent, BoardQrPanelComponent, AnimOnInitDirective, SvgComponent],
  templateUrl: "./board.component.html",
})
export class BoardComponent implements OnInit, OnDestroy {
  public readonly worldStore: WorldStore;

  public readonly catalogForcedPhase = input<string | null>(null);

  public readonly playerUrl = signal<string>("");
  public readonly playerQrDataUrl = signal<string | null>(null);
  public readonly isSetupDrawerOpen = signal<boolean>(false);
  public readonly isBoardReady = signal<boolean>(false);
  public readonly isBootstrapping = signal<boolean>(true);
  public readonly bootErrorText = signal<string | null>(null);
  public readonly sessionCode = signal<string | null>(null);
  public readonly timeLeft = signal<string>("");

  private sessionId: string | null = null;
  private routeSubscription: Subscription | null = null;
  private unsubscribeWs: (() => void) | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public readonly currentTimerEndsAt = computed(() => {
    const ps = this.worldStore.stickerCollageGameState()?.phaseState;
    if (!ps) return 0;
    if (ps.phase === "BUILDING") return ps.roundEndsAt;
    if (ps.phase === "VOTING") return ps.votingEndsAt;
    if (ps.phase === "RESULTS") return ps.resultsEndsAt;
    return 0;
  });

  public readonly gameState = computed(() => this.worldStore.stickerCollageGameState());
  public readonly phase = computed(() => this.catalogForcedPhase() ?? (this.gameState()?.phaseState.phase ?? 'LOBBY'));
  public readonly connectedPlayers = computed<SessionPlayer[]>(() =>
    Object.values(this.worldStore.players()).filter(p => p.connected)
  );

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
    if (this.catalogForcedPhase()) {
      this.isBoardReady.set(true);
      this.isBootstrapping.set(false);
      return;
    }

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

  public async backToLobby(): Promise<void> {
    this.cleanupBoardRuntime();
    await this.router.navigate(["/board"]);
  }

  public resetSession(): void {
    this.wsService.send({type: "reset-session"});
  }

  public startGame(): void {
    const action: StickerCollageClientAction = {type: "start-game"};
    this.wsService.send({type: "game-action", action});
  }

  public endRoundEarly(): void {
    const action: StickerCollageClientAction = {type: "end-round-early"};
    this.wsService.send({type: "game-action", action});
  }

  public endVotingEarly(): void {
    const action: StickerCollageClientAction = {type: "end-voting-early"};
    this.wsService.send({type: "game-action", action});
  }

  public advanceFromResults(): void {
    const action: StickerCollageClientAction = {type: "advance-from-results"};
    this.wsService.send({type: "game-action", action});
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
      console.error("Error while deleting session", this.sessionId);
    }
  }


  private async bootstrapBoardSession(sessionCode: string): Promise<void> {
    this.isBootstrapping.set(true);
    this.bootErrorText.set(null);

    try {
      const resolvedSession = await this.apiService.resolveSessionByCode(sessionCode.toUpperCase());

      this.sessionId = resolvedSession.sessionId;
      this.sessionCode.set(resolvedSession.sessionCode);

      const playerPageUrl = `${window.location.origin}/player?session=${encodeURIComponent(resolvedSession.sessionCode)}`;
      this.playerUrl.set(playerPageUrl);
      this.playerQrDataUrl.set(await QRCode.toDataURL(playerPageUrl, {margin: 1, scale: 6}));

      this.startTimerTick();
      this.unsubscribeWs = this.wsService.onMessage((message) => this.handleMessage(message));
      this.wsService.connect();

      const joinCheckInterval = setInterval(() => {
        if (this.wsService.status() === "connected" && this.sessionId) {
          this.wsService.send({type: "join", kind: "board", sessionId: this.sessionId});
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

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.isBoardReady.set(false);
  }

  private handleMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case "session-state": {
        this.worldStore.setSessionState(message.state);
        break;
      }

      default:
        break;
    }
  }

  private startTimerTick(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.timerInterval = setInterval(() => {
      const endsAt = this.currentTimerEndsAt();

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
}
