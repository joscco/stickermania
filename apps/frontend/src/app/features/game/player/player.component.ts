import {CommonModule} from "@angular/common";
import {Component, computed, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {LobbyAvatarComponent} from './lobby/lobby-avatar.component';
import {LobbyNameComponent} from './lobby/lobby-name.component';
import {PlayerConnectingComponent} from './scenes/connecting/player-connecting.component';
import {PlayerReconnectingComponent} from './scenes/reconnecting/player-reconnecting.component';
import {PlayerDisconnectedComponent} from './scenes/disconnected/player-disconnected.component';
import {PlayerLobbyWaitingComponent} from './scenes/lobby-waiting/player-lobby-waiting.component';
import {PlayerBuildingComponent, SubmitCollageEvent} from './scenes/building/player-building.component';
import {PlayerBuildingSubmittedComponent} from './scenes/building-submitted/player-building-submitted.component';
import {PlayerBuildingSkippedComponent} from './scenes/building-skipped/player-building-skipped.component';
import {PlayerVotingComponent} from './scenes/voting/player-voting.component';
import {PlayerResultsComponent} from './scenes/results/player-results.component';
import {PlayerNextRoundComponent} from './scenes/next-round/player-next-round.component';
import {StickerEventHandler} from '../services/sticker-event-handler';
import {StickerPlayerService} from '../services/sticker-player.service';
import {PlayerTimerService} from '../services/player-timer.service';
import {PlayerMessageHandler} from '../services/player-message-handler.service';
import {WebSocketService} from '../../../core/websocket.service';
import {ApiService} from '../../../core/api.service';
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {ReconnectService} from '../../../core/reconnect.service';
import {PlayerScreen} from './player-screen.enum';
import {SvgComponent} from '../../shared/svg/svg.component';


@Component({
  selector: "app-player",
  standalone: true,
  imports: [
    CommonModule,
    LobbyNameComponent,
    LobbyAvatarComponent,
    PlayerConnectingComponent,
    PlayerReconnectingComponent,
    PlayerDisconnectedComponent,
    PlayerLobbyWaitingComponent,
    PlayerBuildingComponent,
    PlayerBuildingSubmittedComponent,
    PlayerBuildingSkippedComponent,
    PlayerVotingComponent,
    PlayerResultsComponent,
    PlayerNextRoundComponent,
    SvgComponent,
  ],
  providers: [
    PlayerMessageHandler,
    PlayerTimerService,
    StickerPlayerService,
    StickerEventHandler,
  ],
  templateUrl: "./player.component.html",
})
export class PlayerComponent implements OnInit, OnDestroy {
  private unsubscribeWs: (() => void) | null = null;

  public readonly isEditingName = signal(false);
  public readonly isEditingAvatar = signal(false);
  public readonly wasConnected = computed(() => this.wsService.wasConnected());

  /** When set via ?screen= query param, this overrides all live-state logic. */
  private readonly forcedScreen = signal<PlayerScreen | null>(null);

  /** Resolves which PlayerScreen to render from live store/connection state. */
  public readonly currentScreen = computed<PlayerScreen>(
    () => this.forcedScreen() ?? this.screenFromStore()
  );
  public readonly PlayerScreen = PlayerScreen;

  constructor(
    private readonly wsService: WebSocketService,
    private readonly apiService: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly reconnectService: ReconnectService,
    public readonly sessionStore: GameSessionStore,
    public readonly worldStore: WorldStore,
    public readonly timer: PlayerTimerService,
    private readonly messageHandler: PlayerMessageHandler,
    public readonly stickerService: StickerPlayerService,
  ) {
    const deviceName = this.reconnectService.loadDeviceName();
    if (deviceName) {
      this.sessionStore.playerName.set(deviceName);
    }
  }

  public readonly myScore = computed(() => {
    const id = this.sessionStore.playerId();
    return id ? (this.worldStore.players()[id]?.score ?? 0) : 0;
  });
  public readonly isNameSet = computed(() => this.sessionStore.playerName().trim().length > 0);
  public readonly hasAvatar = computed(() => {
    const id = this.sessionStore.playerId();
    return id ? !!this.worldStore.players()[id]?.avatarUrl : false;
  });

  public readonly existingAvatarImage = computed(() => {
    const id = this.sessionStore.playerId();
    return id ? (this.worldStore.players()[id]?.avatarUrl ?? null) : null;
  });

  public readonly isReady = computed(() => {
    const state = this.worldStore.sessionState();
    if (!state) return false;
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return !!state.players[playerId];
  });

  // ── Lifecycle ──────────────────────────────────────────────

  public async ngOnInit(): Promise<void> {
    // ?screen=connecting  →  render that screen directly, skip all WS logic.
    const forcedScreenParam = this.route.snapshot.queryParamMap.get('screen');
    if (forcedScreenParam) {
      this.forcedScreen.set(forcedScreenParam as PlayerScreen);
      return;
    }

    const reconnect = this.reconnectService.load();
    const sessionCode = this.reconnectService.resolveSessionCode(this.route);

    if (!sessionCode) {
      await this.router.navigate(["/"]);
      return;
    }

    this.messageHandler.sessionCode = sessionCode;

    this.unsubscribeWs = this.wsService.onMessage((msg) => this.messageHandler.handle(msg));
    this.wsService.connect();

    try {
      const resolved = await this.apiService.resolveSessionByCode(sessionCode);
      this.sessionStore.setSession(resolved.sessionId);
      this.messageHandler.sessionCode = resolved.sessionCode ?? sessionCode;

      const isSameSession = reconnect?.sessionId === resolved.sessionId;
      const playerId = isSameSession ? (reconnect?.playerId ?? null) : null;
      if (!isSameSession) {
        this.reconnectService.clear();
      }

      const joinMsg = {
        type: "join" as const,
        kind: "player" as const,
        sessionId: resolved.sessionId,
        playerId: playerId ?? undefined,
      };
      this.wsService.send(joinMsg);

    } catch {
      this.wsService.disconnect();
      this.reconnectService.clear();
      this.sessionStore.showFeedback("Session wurde nicht gefunden oder ist abgelaufen.", "error");
      setTimeout(() => {
        void this.router.navigate(["/"], {
          queryParams: {error: "invalid-session"},
          replaceUrl: true,
        });
      }, 2500);
    }
  }

  public ngOnDestroy(): void {
    this.unsubscribeWs?.();
  }

  // ── Screen resolution from live store ─────────────────────

  private screenFromStore(): PlayerScreen {
    const wsStatus = this.wsService.status();
    if (wsStatus === 'idle' || wsStatus === 'connecting') {
      return this.wasConnected() ? PlayerScreen.RECONNECTING : PlayerScreen.CONNECTING;
    }
    if (wsStatus === 'disconnected') return PlayerScreen.DISCONNECTED;
    if (!this.isNameSet() || this.isEditingName()) return PlayerScreen.LOBBY_NAME;
    if (this.isEditingAvatar()) return PlayerScreen.LOBBY_AVATAR;
    if (!this.isReady()) return PlayerScreen.CONNECTING;
    if (!this.hasAvatar()) return PlayerScreen.LOBBY_AVATAR;

    const phase = this.worldStore.stickerCollageGameState()?.phaseState.phase ?? 'LOBBY';
    switch (phase) {
      case 'LOBBY':            return PlayerScreen.LOBBY_WAITING;
      case 'BUILDING': {
        if (this.stickerService.hasSubmittedThisRound()) return PlayerScreen.BUILDING_SUBMITTED;
        if (this.stickerService.hasSkippedThisRound())  return PlayerScreen.BUILDING_SKIPPED;
        if (!this.stickerService.myHand()) {
          this.stickerService.requestHand();
        }
        return PlayerScreen.BUILDING;
      }
      case 'VOTING':           return PlayerScreen.VOTING;
      case 'RESULTS':          return PlayerScreen.RESULTS;
      case 'NEXT_ROUND_SETUP': return PlayerScreen.NEXT_ROUND;
      default:                 return PlayerScreen.LOBBY_WAITING;
    }
  }

  // ── UI actions ─────────────────────────────────────────────

  public startEditName(): void { this.isEditingName.set(true); }
  public startEditAvatar(): void { this.isEditingAvatar.set(true); }

  public onNameSubmitted(name: string): void {
    this.wsService.send({ type: "set-name", name });
    this.sessionStore.playerName.set(name);
    this.reconnectService.saveDeviceName(name);
    this.isEditingName.set(false);
  }

  public onAvatarSubmitted(dataUrl: string): void {
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: dataUrl });
    this.sessionStore.clearTask();
    this.isEditingAvatar.set(false);
  }

  public onAvatarSkipped(): void {
    this.sessionStore.clearTask();
    this.isEditingAvatar.set(false);
  }

  public onSubmitCollage(event: SubmitCollageEvent): void {
    this.stickerService.submitCollage(event.placements);
    if (event.imageDataUrl) {
      this.uploadSnapshot(event.imageDataUrl);
    }
  }

  private async uploadSnapshot(imageDataUrl: string): Promise<void> {
    const sessionId = this.sessionStore.sessionId();
    const playerId  = this.sessionStore.playerId();
    if (!sessionId || !playerId) return;

    let collageId: string | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const ms = this.stickerService.gameState();
      if (ms) {
        const mine = (ms.submissions[ms.currentRoundIndex] ?? []).find(s => s.playerId === playerId);
        if (mine) { collageId = mine.id; break; }
      }
      await new Promise(r => setTimeout(r, 200));
    }
    if (!collageId) return;
    try { await this.apiService.uploadCollageImage(sessionId, playerId, collageId, imageDataUrl); } catch {}
  }
}