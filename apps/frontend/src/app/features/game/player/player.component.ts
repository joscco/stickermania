import {CommonModule} from "@angular/common";
import {Component, computed, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {StickerPlayerViewComponent} from './sticker-player-view.component';
import {LobbyAvatarComponent} from './lobby/lobby-avatar.component';
import {LobbyNameComponent} from './lobby/lobby-name.component';
import {StickerEventHandler} from '../services/sticker-event-handler';
import {StickerPlayerService} from '../services/sticker-player.service';
import {PlayerTimerService} from '../services/player-timer.service';
import {PlayerMessageHandler} from '../services/player-message-handler.service';
import {WebSocketService} from '../../../core/websocket.service';
import {ApiService} from '../../../core/api.service';
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {ReconnectService} from '../../../core/reconnect.service';

@Component({
  selector: "app-player",
  standalone: true,
  imports: [
    CommonModule,
    LobbyNameComponent,
    LobbyAvatarComponent,
    StickerPlayerViewComponent,
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

  /** When true, the user is editing their name (even if already set). */
  public readonly isEditingName = signal(false);
  /** When true, the user is editing their avatar (even if already set). */
  public readonly isEditingAvatar = signal(false);

  public readonly isConnecting = computed(() => {
    const s = this.wsService.status();
    return s === "idle" || s === "connecting";
  });
  public readonly isDisconnected = computed(() => this.wsService.status() === "disconnected");
  public readonly wasConnected = computed(() => this.wsService.wasConnected());

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
    // Pre-fill name from device-level storage (survives session changes)
    const deviceName = this.reconnectService.loadDeviceName();
    if (deviceName) {
      this.sessionStore.playerName.set(deviceName);
    }
  }

  public readonly activeMode = computed(() => this.worldStore.activeMode());
  public readonly myScore = computed(() => {
    const id = this.sessionStore.playerId();
    return id ? (this.worldStore.players()[id]?.score ?? 0) : 0;
  });
  public readonly isNameSet = computed(() => this.sessionStore.playerName().trim().length > 0);
  public readonly hasAvatar = computed(() => {
    const id = this.sessionStore.playerId();
    return id ? !!this.worldStore.players()[id]?.avatarUrl : false;
  });

  /** Existing avatar image to pre-populate the avatar drawing canvas. */
  public readonly existingAvatarImage = computed(() => {
    // Prefer device-cached data-URL (always available, no CORS issues)
    const deviceAvatar = this.reconnectService.loadDeviceAvatar();
    if (deviceAvatar) return deviceAvatar;
    // Fallback: current server avatar URL
    const id = this.sessionStore.playerId();
    return id ? (this.worldStore.players()[id]?.avatarUrl ?? null) : null;
  });


  /**
   * True once we have received a session-state AND our player exists in it.
   * Until then we show a loading spinner to avoid flashing lobby/avatar screens
   * during reconnect.
   */
  public readonly isReady = computed(() => {
    const state = this.worldStore.sessionState();
    if (!state) return false;
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return !!state.players[playerId];
  });

  protected readonly activeTitle = computed(() => {
    switch (this.activeMode()) {
      case "sticker-collage": return "Stickermania";
      default: return "";
    }
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

    // Determine whether this is a reconnect to the SAME session or a session change.
    const isSameSession = reconnect?.sessionCode?.toUpperCase() === sessionCode.toUpperCase();
    const playerId = isSameSession
        ? (reconnect?.playerId ?? localStorage.getItem("birthday_player_id") ?? null)
        : null;


    // If switching sessions, clear stale reconnect data
    if (!isSameSession) {
      this.reconnectService.clear();
    }

    // Set sessionCode on the message handler BEFORE connecting so that any
    // incoming "welcome" message will have the correct code for reconnect storage.
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
      // Update to the canonical code returned by the server
      this.messageHandler.sessionCode = resolved.sessionCode ?? sessionCode;

      localStorage.setItem("birthday_last_session_code", resolved.sessionCode);

      const joinMsg = {
        type: "join" as const,
        kind: "player" as const,
        sessionId: resolved.sessionId,
        playerId: playerId ?? undefined,
      };

      // send() stores the join as pendingJoinMsg. If WS is already open
      // it goes out immediately; otherwise onopen re-sends it automatically.
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

  // ── UI actions ─────────────────────────────────────────────

  public startEditName(): void {
    this.isEditingName.set(true);
  }

  public startEditAvatar(): void {
    this.isEditingAvatar.set(true);
  }

  public onNameSubmitted(name: string): void {
    this.wsService.send({ type: "set-name", name });
    this.sessionStore.playerName.set(name);
    this.reconnectService.update({ playerName: name });
    this.reconnectService.saveDeviceName(name);
    this.isEditingName.set(false);
  }

  public onAvatarSubmitted(dataUrl: string): void {
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: dataUrl });
    this.reconnectService.saveDeviceAvatar(dataUrl);
    this.sessionStore.clearTask();
    this.isEditingAvatar.set(false);
  }

  public onAvatarSkipped(): void {
    this.sessionStore.clearTask();
    this.isEditingAvatar.set(false);
  }
}
