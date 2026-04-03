import {CommonModule} from "@angular/common";
import {Component, computed, effect, OnDestroy, OnInit, signal} from "@angular/core";
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
import {LobbyAvatarComponent} from "./lobby/lobby-avatar.component";
import {LobbyNameComponent} from "./lobby/lobby-name.component";
import {GardenPlayerService} from '../garden-game/services/garden-player.service';
import {GraffitiEventHandler} from '../graffiti-game/services/graffiti-event-handler';
import {DrawSearchEventHandler} from '../museum-game/services/draw-search-event-handler';
import {GraffitiPlayerService} from '../graffiti-game/services/graffiti-player.service';
import {GardenEventHandler} from '../garden-game/services/garden-event-handler';

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
  ],
  providers: [
    PlayerMessageHandler,
    PlayerTimerService,
    GardenPlayerService,
    GraffitiPlayerService,
    DrawSearchEventHandler,
    GardenEventHandler,
    GraffitiEventHandler,
  ],
  templateUrl: "./player.component.html",
})
export class PlayerComponent implements OnInit, OnDestroy {
  private unsubscribeWs: (() => void) | null = null;

  /** When true, the user is editing their name (even if already set). */
  public readonly isEditingName = signal(false);
  /** When true, the user is editing their avatar (even if already set). */
  public readonly isEditingAvatar = signal(false);

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
    const reconnect = this.reconnectService.load();
    if (reconnect?.playerName) {
      this.sessionStore.playerName.set(reconnect.playerName);
    }

    // Watch for session-fatal errors and redirect to /join
    effect(() => {
      const status = this.wsService.status();
      const feedback = this.sessionStore.feedback();

      // If we get an error feedback and the WS is disconnected, redirect after a short delay
      if (feedback?.type === "error" && status === "disconnected") {
        setTimeout(() => this.redirectToJoin(), 2000);
      }
    });
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
  public readonly wsStatus = computed(() => this.wsService.status());

  /**
   * True once we have received a session-state AND our player exists in it.
   * Until then we show a loading spinner to avoid flashing lobby/avatar screens
   * during reconnect.
   */
  public readonly isReady = computed(() => {
    const state = this.worldStore.sessionState();
    if (!state) {
      return false;
    }
    const playerId = this.sessionStore.playerId();
    if (!playerId) {
      return false;
    }
    return !!state.players[playerId];
  });

  // ── Lifecycle ──────────────────────────────────────────────

  public async ngOnInit(): Promise<void> {
    const reconnect = this.reconnectService.load();
    const playerId = reconnect?.playerId ?? localStorage.getItem("birthday_player_id") ?? null;
    const sessionCode = this.reconnectService.resolveSessionCode(this.route);

    if (!sessionCode) {
      if (reconnect?.sessionCode) {
        await this.router.navigate(["/player"], { queryParams: { session: reconnect.sessionCode } });
        return;
      }
      await this.router.navigate(["/join"]);
      return;
    }

    try {
      const resolved = await this.apiService.resolveSessionByCode(sessionCode);
      this.sessionStore.setSession(resolved.sessionId);
      this.messageHandler.sessionCode = resolved.sessionCode ?? sessionCode;

      localStorage.setItem("birthday_last_session_code", resolved.sessionCode);

      this.wsService.connect();
      this.unsubscribeWs = this.wsService.onMessage((msg) => {
        this.messageHandler.handle(msg);

        // Handle session-fatal errors: redirect to join
        if (msg.type === "error") {
          const fatal = /session|nicht gefunden|abgelaufen|gelöscht|closed|deleted/i.test(msg.message);
          if (fatal) {
            this.reconnectService.clear();
            setTimeout(() => this.redirectToJoin(), 2500);
          }
        }
      });

      const joinCheck = setInterval(() => {
        if (this.wsService.status() === "connected") {
          this.wsService.send({
            type: "join",
            kind: "player",
            sessionId: resolved.sessionId,
            playerId: playerId ?? undefined,
          });
          clearInterval(joinCheck);
        }
      }, 200);

      this.registerGlobalAudioUnlock();
    } catch {
      this.sessionStore.showFeedback("Session wurde nicht gefunden oder ist abgelaufen.", "error");
      setTimeout(() => this.redirectToJoin(), 2500);
    }
  }

  public ngOnDestroy(): void {
    this.unsubscribeWs?.();
  }

  // ── Name / Avatar editing ─────────────────────────────────

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

  public redirectToJoin(): void {
    this.router.navigate(["/join"]);
  }

  private registerGlobalAudioUnlock(): void {
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }
}
