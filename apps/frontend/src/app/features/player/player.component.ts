import {CommonModule} from "@angular/common";
import {Component, computed, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {GameSessionStore} from "../../core/challenge.store";
import {ApiService} from "../../core/api.service";
import {ReconnectService} from "../../core/reconnect.service";
import {WebSocketService} from "../../core/websocket.service";
import {WorldStore} from "../../core/world.store";
import {PlayerMessageHandler} from "./player-message-handler.service";
import {PlayerTimerService} from "./player-timer.service";
import {DrawSearchPlayerViewComponent} from "../museum-game/player/draw-search-player-view.component";
import {GardenPlayerViewComponent} from "../garden-game/player/garden-player-view.component";
import {GraffitiPlayerViewComponent} from "../graffiti-game/player/graffiti-player-view.component";
import {StickerPlayerViewComponent} from "../sticker-game/player/sticker-player-view.component";
import {LobbyAvatarComponent} from "./lobby/lobby-avatar.component";
import {LobbyNameComponent} from "./lobby/lobby-name.component";
import {GardenPlayerService} from '../garden-game/services/garden-player.service';
import {GraffitiEventHandler} from '../graffiti-game/services/graffiti-event-handler';
import {DrawSearchEventHandler} from '../museum-game/services/draw-search-event-handler';
import {GraffitiPlayerService} from '../graffiti-game/services/graffiti-player.service';
import {GardenEventHandler} from '../garden-game/services/garden-event-handler';
import {StickerEventHandler} from '../sticker-game/services/sticker-event-handler';
import {StickerPlayerService} from '../sticker-game/services/sticker-player.service';

@Component({
  selector: "app-player",
  standalone: true,
  imports: [
    CommonModule,
    LobbyNameComponent,
    LobbyAvatarComponent,
    DrawSearchPlayerViewComponent,
    GardenPlayerViewComponent,
    GraffitiPlayerViewComponent,
    StickerPlayerViewComponent,
  ],
  providers: [
    PlayerMessageHandler,
    PlayerTimerService,
    GardenPlayerService,
    GraffitiPlayerService,
    StickerPlayerService,
    DrawSearchEventHandler,
    GardenEventHandler,
    GraffitiEventHandler,
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
      case "draw-search": return "Zeichnen & Finden";
      case "garden-coop": return "Gemeinschaftsgarten";
      case "team-graffiti": return "Tag-Spiel";
      case "sticker-collage": return "Sticker-Collage";
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

      // send() stores join as pendingJoinMsg — auto-sent on onopen if WS isn't ready yet
      this.wsService.send({
        type: "join",
        kind: "player",
        sessionId: resolved.sessionId,
        playerId: playerId ?? undefined,
      });

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
