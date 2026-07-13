import {CommonModule} from "@angular/common";
import {Component, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import * as QRCode from "qrcode";
import {Subscription} from "rxjs";
import {SessionRuntimeService} from "../../core/runtime/session-runtime.service";
import {SvgComponent} from "../../shared/ui/svg/svg.component";
import {BoardLobbyComponent} from "./board-lobby/board-lobby.component";
import {BoardScreenDataService} from "./board-screen-data.service";
import {BoardSessionController} from "./board-session.controller";
import {BoardWorkspaceComponent} from "./board-workspace.component";
import {BoardQrPanelComponent} from "./qr-panel/board-qr-panel.component";

@Component({
  selector: "app-cloud-board",
  standalone: true,
  imports: [
    CommonModule,
    BoardLobbyComponent,
    BoardQrPanelComponent,
    BoardWorkspaceComponent,
    SvgComponent,
  ],
  providers: [BoardScreenDataService, BoardSessionController],
  templateUrl: "./cloud-board.component.html",
  host: {style: "display: block; height: 100%;"},
})
export class CloudBoardComponent implements OnInit, OnDestroy {
  public readonly requestedSessionCode = signal<string | null>(null);
  private routeSubscription: Subscription | null = null;

  public constructor(
    private readonly sessionRuntime: SessionRuntimeService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    public readonly board: BoardSessionController,
  ) {
  }

  public ngOnInit(): void {
    if (!this.sessionRuntime.supportsBoardScreen()) {
      void this.router.navigate([], {
        queryParams: {view: "player", session: null, error: null},
        queryParamsHandling: "merge",
        replaceUrl: true,
      });
      return;
    }

    this.routeSubscription = this.route.queryParamMap.subscribe(params => {
      const routeSessionCode = params.get("session");
      this.board.cleanup();
      this.requestedSessionCode.set(routeSessionCode);

      if (!routeSessionCode) {
        this.board.isBootstrapping.set(false);
        this.board.bootErrorText.set(null);
        return;
      }

      void this.bootstrapBoardSession(routeSessionCode);
    });
  }

  public ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    this.board.cleanup();
  }

  public async onSessionSelected(sessionCode: string): Promise<void> {
    await this.router.navigate([], {queryParams: {view: "board", session: sessionCode}});
  }

  public clearRequestedSession(): void {
    void this.router.navigate([], {
      queryParams: {view: "board", session: null},
      queryParamsHandling: "merge",
    });
  }

  public retryBootstrap(): void {
    const sessionCode = this.requestedSessionCode();
    if (sessionCode) {
      void this.bootstrapBoardSession(sessionCode);
    }
  }

  private async bootstrapBoardSession(sessionCode: string): Promise<void> {
    this.board.isBootstrapping.set(true);
    this.board.bootErrorText.set(null);

    try {
      const resolvedSession = await this.sessionRuntime.resolveSessionByCode(sessionCode.toUpperCase());

      this.board.sessionCode.set(resolvedSession.sessionCode);
      const playerPageUrl = `${window.location.origin}/?view=player&session=${encodeURIComponent(resolvedSession.sessionCode)}`;
      this.board.playerJoinUrl.set(playerPageUrl);
      this.board.playerQrDataUrl.set(await QRCode.toDataURL(playerPageUrl, {margin: 1, scale: 6}));
      this.board.connectToSession(resolvedSession.sessionId);
      this.board.isBoardReady.set(true);
    } catch {
      this.board.bootErrorText.set("Session wurde nicht gefunden oder ist abgelaufen.");
      this.board.isBoardReady.set(false);
    } finally {
      this.board.isBootstrapping.set(false);
    }
  }
}
