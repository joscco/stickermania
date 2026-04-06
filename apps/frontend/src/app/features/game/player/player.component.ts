import {CommonModule} from "@angular/common";
import {Component, computed, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {StickerPlayerViewComponent} from './sticker-player-view.component';
import {LobbyAvatarComponent} from './lobby/lobby-avatar.component';
import {LobbyNameComponent} from './lobby/lobby-name.component';
import {PlayerConnectingComponent} from './scenes/connecting/player-connecting.component';
import {PlayerReconnectingComponent} from './scenes/reconnecting/player-reconnecting.component';
import {PlayerDisconnectedComponent} from './scenes/disconnected/player-disconnected.component';
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

@Component({
  selector: "app-player",
  standalone: true,
  imports: [
    CommonModule,
    LobbyNameComponent,
    LobbyAvatarComponent,
    StickerPlayerViewComponent,
    PlayerConnectingComponent,
    PlayerReconnectingComponent,
    PlayerDisconnectedComponent,
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

  /** Resolves which PlayerScreen to render from live store/connection state. */
  public readonly currentScreen = computed<PlayerScreen>(() => this.screenFromStore());
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
    const reconnect = this.reconnectService.load();
    const sessionCode = this.reconnectService.resolveSessionCode(this.route);

    if (!sessionCode) {
      if (reconnect?.sessionCode) {
        await this.router.navigate(["/player"], { queryParams: { session: reconnect.sessionCode } });
        return;
      }
      await this.router.navigate(["/join"]);
      return;
    }

    const isSameSession = reconnect?.sessionCode?.toUpperCase() === sessionCode.toUpperCase();
    const playerId = isSameSession
        ? (reconnect?.playerId ?? localStorage.getItem("birthday_player_id") ?? null)
        : null;

    if (!isSameSession) {
      this.reconnectService.clear();
    }

    this.messageHandler.sessionCode = sessionCode;

    // ⚠️ Safari iOS: WebSocket-Verbindung MUSS vor dem ersten `await` gestartet werden.
    //
    // Safari blockiert `new WebSocket()` wenn es innerhalb einer Promise-Continuation
    // aufgerufen wird (= nach einem `await`). Der Handshake hängt dann endlos im
    // CONNECTING-State, ohne dass onopen, onerror oder onclose jemals feuern.
    //
    // Deshalb: Listener registrieren und connect() synchron hier aufrufen,
    // BEVOR wir auf den HTTP-Call (resolveSessionByCode) warten.
    // Das `join`-Paket wird erst nach dem HTTP-Response gesendet — falls der
    // WebSocket dann schon offen ist, geht es sofort raus. Falls nicht, speichert
    // send() es als `pendingJoinMsg` und der WebSocketService sendet es
    // automatisch bei onopen.
    this.unsubscribeWs = this.wsService.onMessage((msg) => this.messageHandler.handle(msg));
    this.wsService.connect();

    try {
      const resolved = await this.apiService.resolveSessionByCode(sessionCode);
      this.sessionStore.setSession(resolved.sessionId);
      this.messageHandler.sessionCode = resolved.sessionCode ?? sessionCode;
      localStorage.setItem("birthday_last_session_code", resolved.sessionCode);

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
      setTimeout(() => this.router.navigate(["/join"]), 2500);
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

    const phase = this.worldStore.stickerCollageModeState()?.phase ?? 'LOBBY';
    switch (phase) {
      case 'LOBBY':            return PlayerScreen.LOBBY_WAITING;
      case 'BUILDING':         return PlayerScreen.BUILDING;
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
    this.reconnectService.update({ playerName: name });
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
}
