import {Component, computed, input, OnDestroy, OnInit, signal, inject} from "@angular/core";
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
import {PlayerVotingDoneComponent} from './scenes/voting/player-voting-done.component';
import {PlayerResultsComponent} from './scenes/results/player-results.component';
import {PlayerNextRoundComponent} from './scenes/next-round/player-next-round.component';
import {PlayerWinnerChoicesComponent} from './scenes/winner-choices/player-winner-choices.component';
import {PlayerHeaderComponent} from './player-header.component';
import {PlayerScreenDataService} from './player-screen-data.service';
import {StickerPlayerService} from '../services/sticker-player.service';
import {PlayerTimerService} from '../services/player-timer.service';
import {PlayerMessageHandler} from '../services/player-message-handler.service';
import {WebSocketService} from '../../../core/websocket.service';
import {ApiService} from '../../../core/api.service';
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {ReconnectService} from '../../../core/reconnect.service';
import {AudioService} from '../../../core/audio.service';
import {PlayerScreen} from './player-screen.enum';


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
    PlayerNextRoundComponent,
    PlayerWinnerChoicesComponent,
    PlayerHeaderComponent,
  ],
  providers: [
    PlayerMessageHandler,
    PlayerTimerService,
    StickerPlayerService,
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
    public readonly worldStore: WorldStore,
    public readonly timer: PlayerTimerService,
    private readonly messageHandler: PlayerMessageHandler,
    public readonly stickerService: StickerPlayerService,
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

  public onSubmitCollage(event: SubmitCollageEvent): void {
    this.stickerService.submitCollage(event.placements);
    if (event.imageDataUrl) {
      this.uploadSnapshot(event.imageDataUrl);
    }
  }

  // ── Sound-wrapped actions ────────────────────────────────

  public startGameWithSound(): void { this.audio.playClick(); this.stickerService.startGame(); }
  public skipRoundWithSound(): void { this.audio.playClick(); this.stickerService.skipRound(); }
  public submitCollageWithSound(event: SubmitCollageEvent): void { this.audio.playAction(); this.onSubmitCollage(event); }
  public endRoundEarlyWithSound(): void { this.audio.playClick(); this.stickerService.endRoundEarly(); }
  public castVoteWithSound(collageId: string): void { this.audio.playClick(); this.stickerService.castVote(collageId); }
  public doneVotingWithSound(): void { this.audio.playClick(); this.stickerService.doneVoting(); }
  public endVotingEarlyWithSound(): void { this.audio.playClick(); this.stickerService.endVotingEarly(); }
  public pickPromptWithSound(prompt: string): void { this.audio.playClick(); this.stickerService.pickPrompt(prompt); }
  public unlockPackWithSound(packId: string): void { this.audio.playClick(); this.stickerService.unlockPack(packId); }
  public readyToAdvanceWithSound(): void { this.audio.playAction(); this.stickerService.readyToAdvance(); }

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
