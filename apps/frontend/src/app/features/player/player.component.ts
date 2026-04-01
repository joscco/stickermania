import {CommonModule} from "@angular/common";
import {Component, computed, OnDestroy, OnInit} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {GameSessionStore} from "../../core/challenge.store";
import {ApiService} from "../../core/api.service";
import {ReconnectService} from "../../core/reconnect.service";
import {WebSocketService} from "../../core/websocket.service";
import {WorldStore} from "../../core/world.store";
import {PlayerMessageHandler} from "./player-message-handler.service";
import {PlayerTimerService} from "./player-timer.service";
import {GardenPlayerService} from "../garden-game/player/garden-player.service";
import {GraffitiPlayerService} from "../graffiti-game/player/graffiti-player.service";
import {DrawSearchPlayerViewComponent} from "../museum-game/player/draw-search-player-view.component";
import {GardenPlayerViewComponent} from "../garden-game/player/garden-player-view.component";
import {GraffitiPlayerViewComponent} from "../graffiti-game/player/graffiti-player-view.component";
import {LobbyAvatarComponent} from "./lobby/lobby-avatar.component";
import {LobbyNameComponent} from "./lobby/lobby-name.component";

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
  ],
  templateUrl: "./player.component.html",
})
export class PlayerComponent implements OnInit, OnDestroy {
  private unsubscribeWs: (() => void) | null = null;

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
      this.unsubscribeWs = this.wsService.onMessage((msg) => this.messageHandler.handle(msg));

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
      await this.router.navigate(["/join"]);
    }
  }

  public ngOnDestroy(): void {
    this.unsubscribeWs?.();
  }

  public onNameSubmitted(name: string): void {
    this.wsService.send({ type: "set-name", name });
    this.sessionStore.playerName.set(name);
    this.reconnectService.update({ playerName: name });
  }

  public onAvatarSubmitted(dataUrl: string): void {
    this.wsService.send({ type: "submit-avatar", avatarDataUrl: dataUrl });
    this.sessionStore.clearTask();
  }

  public onAvatarSkipped(): void {
    this.sessionStore.clearTask();
  }

  // ── Helpers ────────────────────────────────────────────────

  private registerGlobalAudioUnlock(): void {
    const unlock = () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }
}
