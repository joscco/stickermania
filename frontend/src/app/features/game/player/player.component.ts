import {Component, computed, input, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {PlayerConnectingComponent} from './scenes/connecting/player-connecting.component';
import {PlayerReconnectingComponent} from './scenes/reconnecting/player-reconnecting.component';
import {PlayerDisconnectedComponent} from './scenes/disconnected/player-disconnected.component';
import {PlayerLobbyWaitingComponent} from './scenes/lobby-waiting/player-lobby-waiting.component';
import {MinigameSubmitEvent, PlayerBuildingComponent} from './scenes/building/player-building.component';
import {PlayerBuildingSubmittedComponent} from './scenes/building-submitted/player-building-submitted.component';
import {PlayerBuildingSkippedComponent} from './scenes/building-skipped/player-building-skipped.component';
import {PlayerVotingComponent} from './scenes/voting/player-voting.component';
import {PlayerVotingDoneComponent} from './scenes/voting/player-voting-done.component';
import {PlayerResultsComponent} from './scenes/results/player-results.component';
import {PlayerScreenDataService} from './player-screen-data.service';
import {PartyPlayerService} from '../services/party-player.service';
import {PlayerTimerService} from '../services/player-timer.service';
import {PlayerMessageHandler} from '../services/player-message-handler.service';
import {WebSocketService} from '../../../core/websocket.service';
import {ApiService} from '../../../core/api.service';
import {GameSessionStore} from '../../../core/challenge.store';
import {ReconnectService} from '../../../core/reconnect.service';
import {AudioService} from '../../../core/audio.service';
import {PlayerScreen} from './player-screen.enum';
import {LobbyNameComponent} from './scenes/lobby-name/lobby-name.component';
import {LobbyAvatarComponent} from './scenes/lobby-avatar/lobby-avatar.component';
import {PlayerHeaderComponent} from './player-header/player-header.component';
import {TimerFillComponent} from '../../shared/timer-fill/timer-fill.component';
import {TimerNotificationComponent} from '../../shared/timer-notification/timer-notification.component';
import {AnimPresenceDirective} from '../../shared/animations/anim-on-init.directive';


@Component({
  selector: "app-player",
  standalone: true,
  imports: [
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
    PlayerVotingDoneComponent,
    PlayerResultsComponent,
    PlayerHeaderComponent,
    TimerFillComponent, TimerNotificationComponent,
    AnimPresenceDirective,

  ],
  providers: [
    PlayerMessageHandler,
    PlayerTimerService,
    PartyPlayerService,
    PlayerScreenDataService,
  ],
  templateUrl: "./player.component.html",
  host: {style: 'display: block; height: 100%;'},
})
export class PlayerComponent implements OnInit, OnDestroy {
  private unsubscribeWs: (() => void) | null = null;

  public readonly catalogForcedScreen = input<PlayerScreen | null>(null);

  private forcedScreenFromUrl = signal<PlayerScreen | null>(null);

  public readonly currentScreen = computed<PlayerScreen>(
    () => this.catalogForcedScreen() ?? this.forcedScreenFromUrl() ?? this.screenData.baseScreen()
  );

  public readonly PlayerScreen = PlayerScreen;

  constructor(
    private readonly wsService: WebSocketService,
    private readonly apiService: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly reconnectService: ReconnectService,
    public readonly sessionStore: GameSessionStore,
    public readonly timer: PlayerTimerService,
    private readonly messageHandler: PlayerMessageHandler,
    public readonly partyService: PartyPlayerService,
    public readonly screenData: PlayerScreenDataService,
    public readonly audio: AudioService,
  ) {
    const deviceName = this.reconnectService.loadDeviceName();
    if (deviceName) {
      this.sessionStore.playerName.set(deviceName);
    }
  }

  public async ngOnInit(): Promise<void> {
    if (this.catalogForcedScreen()) {
      return;
    }

    const forcedScreenParam = this.route.snapshot.queryParamMap.get('screen');
    if (forcedScreenParam) {
      this.forcedScreenFromUrl.set(forcedScreenParam as PlayerScreen);
      return;
    }

    const reconnect = this.reconnectService.load();
    const sessionCode = this.reconnectService.resolveSessionCode(this.route);

    if (!sessionCode) {
      await this.router.navigate([], {queryParams: {view: "landing"}});
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
      setTimeout(() => {
        void this.router.navigate([], {
          queryParams: {view: "landing", error: "invalid-session"},
          replaceUrl: true,
        });
      }, 2500);
    }
  }

  public ngOnDestroy(): void {
    this.unsubscribeWs?.();
  }

  public startEditName(): void { this.screenData.isEditingName.set(true); }
  public startEditAvatar(): void { this.screenData.isEditingAvatar.set(true); }

  public onNameSubmitted(name: string): void {
    this.wsService.send({ type: "set-name", name });
    this.sessionStore.playerName.set(name);
    this.reconnectService.saveDeviceName(name);
    this.screenData.isEditingName.set(false);
  }

  public onAvatarSubmitted(dataUrl: string): void {
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: dataUrl });
    this.sessionStore.clearTask();
    this.screenData.isEditingAvatar.set(false);
  }

  public onSubmitMinigame(event: MinigameSubmitEvent): void {
    this.audio.playAction();
    this.partyService.submitMinigame(event as import("@birthday/shared").MinigameClientAction);
  }

  // ── Sound-wrapped actions ────────────────────────────────

  public startGameWithSound(): void { this.audio.playClick(); this.partyService.startGame(); }
  public skipRoundWithSound(): void { this.audio.playClick(); this.partyService.skipRound(); }
  public endRoundEarlyWithSound(): void { this.audio.playClick(); this.partyService.endRoundEarly(); }
  public castVoteWithSound(submissionId: string): void { this.audio.playClick(); this.partyService.castVote(submissionId); }
  public doneVotingWithSound(): void { this.audio.playClick(); this.partyService.doneVoting(); }
  public endVotingEarlyWithSound(): void { this.audio.playClick(); this.partyService.endVotingEarly(); }
  public readyToAdvanceWithSound(): void { this.audio.playAction(); this.partyService.readyToAdvance(); }
}
