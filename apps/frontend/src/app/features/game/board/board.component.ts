import {CommonModule} from "@angular/common";
import {Component, computed, input, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import type {ServerToClientMessage, StickerCollageClientAction} from "@birthday/shared";
import * as QRCode from "qrcode";
import {Subscription} from "rxjs";
import {BoardLobbyComponent} from './board-lobby.component';
import {BoardLobbySceneComponent} from './scenes/lobby/board-lobby-scene.component';
import {BoardBuildingSceneComponent} from './scenes/building/board-building-scene.component';
import {BoardVotingSceneComponent} from './scenes/voting/board-voting-scene.component';
import {BoardResultsSceneComponent} from './scenes/results/board-results-scene.component';
import {BoardQrPanelComponent} from './qr-panel/board-qr-panel.component';
import {BoardHeaderComponent} from './board-header.component';
import {BoardScreenDataService} from './board-screen-data.service';
import {AnimOnInitDirective} from '../../shared/animations/anim-on-init.directive';
import {WebSocketService} from '../../../core/websocket.service';
import {ApiService} from '../../../core/api.service';
import {WorldStore} from '../../../core/world.store';

@Component({
  selector: "app-board",
  standalone: true,
  imports: [
    CommonModule, BoardLobbyComponent,
    BoardLobbySceneComponent, BoardBuildingSceneComponent,
    BoardVotingSceneComponent, BoardResultsSceneComponent,
    BoardQrPanelComponent, BoardHeaderComponent,
    AnimOnInitDirective,
  ],
  providers: [BoardScreenDataService],
  templateUrl: "./board.component.html",
})
export class BoardComponent implements OnInit, OnDestroy {
  public readonly catalogForcedPhase = input<string | null>(null);

  public readonly playerUrl = signal<string>("");
  public readonly playerQrDataUrl = signal<string | null>(null);
  public readonly isBoardReady = signal<boolean>(false);
  public readonly isBootstrapping = signal<boolean>(true);
  public readonly bootErrorText = signal<string | null>(null);
  public readonly sessionCode = signal<string | null>(null);

  public readonly phase = computed(() =>
    this.catalogForcedPhase() ?? this.screenData.basePhase()
  );

  public readonly gameState = computed(() => this.screenData.gameState());

  private sessionId: string | null = null;
  private routeSubscription: Subscription | null = null;
  private unsubscribeWs: (() => void) | null = null;

  public constructor(
    private readonly wsService: WebSocketService,
    private readonly apiService: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly worldStore: WorldStore,
    public readonly screenData: BoardScreenDataService,
  ) {}

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
    if (!this.sessionId) return;
    if (!confirm("Session wirklich löschen? Alle Spieler werden getrennt und alle Daten gehen verloren.")) return;

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

      this.screenData.startTimerTick();
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
    this.screenData.closeSetupDrawer();
    this.screenData.stopTimerTick();
    this.isBoardReady.set(false);
  }

  private handleMessage(message: ServerToClientMessage): void {
    if (message.type === "session-state") {
      this.worldStore.setSessionState(message.state);
    }
  }
}
