import {CommonModule} from "@angular/common";
import {Component, OnDestroy, OnInit, signal} from "@angular/core";
import * as QRCode from "qrcode";
import {SessionRuntimeService} from "../../core/runtime/session-runtime.service";
import {SvgComponent} from "../../shared/ui/svg/svg.component";
import {buildStaticBoardExportZip} from "./export/board-static-export";
import {BoardScreenDataService} from "./board-screen-data.service";
import {BoardSessionController} from "./board-session.controller";
import {BoardWorkspaceComponent} from "./board-workspace.component";
import {BoardQrPanelComponent} from "./qr-panel/board-qr-panel.component";
import {BoardActionButtonComponent, type BoardActionButtonState} from "../../shared/stickers/board-actions/board-action-button.component";

@Component({
  selector: "app-lan-host-board",
  standalone: true,
  imports: [
    CommonModule,
    BoardWorkspaceComponent,
    BoardQrPanelComponent,
    BoardActionButtonComponent,
    SvgComponent,
  ],
  providers: [BoardScreenDataService, BoardSessionController],
  templateUrl: "./lan-host-board.component.html",
  host: {style: "display: block; height: 100%;"},
})
export class LanHostBoardComponent implements OnInit, OnDestroy {
  public readonly exportState = signal<BoardActionButtonState>("idle");
  public readonly resetState = signal<BoardActionButtonState>("idle");

  public constructor(
    private readonly sessionRuntime: SessionRuntimeService,
    public readonly board: BoardSessionController,
  ) {
  }

  public ngOnInit(): void {
    this.board.setBoardMode("view");
    void this.bootstrapHostBoard();
  }

  public ngOnDestroy(): void {
    this.board.cleanup();
  }

  public retryBootstrap(): void {
    void this.bootstrapHostBoard();
  }

  public async exportHostBoard(event: Event): Promise<void> {
    event.stopPropagation();
    const sessionId = this.board.currentSessionId;
    if (!sessionId || this.exportState() === "loading") {
      return;
    }

    this.exportState.set("loading");
    try {
      const [state, sessionAssets] = await Promise.all([
        this.sessionRuntime.getSessionState(sessionId),
        this.sessionRuntime.getSessionAssets(sessionId),
      ]);
      const content = await buildStaticBoardExportZip({state, sessionCode: state.sessionCode, sessionAssets});
      this.downloadBlob(content, `stickermania-board-${state.sessionCode}.zip`);
      this.exportState.set("done");
      window.setTimeout(() => this.exportState.set("idle"), 1800);
    } catch {
      this.exportState.set("error");
      window.setTimeout(() => this.exportState.set("idle"), 2400);
    }
  }

  public resetHostBoard(event: Event): void {
    event.stopPropagation();
    if (this.resetState() === "loading") {
      return;
    }

    if (this.board.boardEditorPlacements().length === 0) {
      this.resetState.set("done");
      window.setTimeout(() => this.resetState.set("idle"), 1200);
      return;
    }

    if (!window.confirm("Alle platzierten Sticker vom Board entfernen? Hochgeladene Sticker und Spieler bleiben erhalten.")) {
      return;
    }

    this.resetState.set("loading");
    this.board.clearBoardPlacements();
    this.resetState.set("done");
    window.setTimeout(() => this.resetState.set("idle"), 1800);
  }

  private async bootstrapHostBoard(): Promise<void> {
    this.board.cleanup();
    this.board.setBoardMode("view");
    this.board.isBootstrapping.set(true);
    this.board.bootErrorText.set(null);

    try {
      const hostGame = await this.sessionRuntime.getOrCreateHostGame();
      this.board.sessionCode.set(null);
      const runtimeInfo = await this.sessionRuntime.getHostRuntimeInfo().catch(() => null);
      const playerPageUrl = this.selectHostPlayerJoinUrl(runtimeInfo);
      if (!playerPageUrl) {
        throw new Error("Keine LAN-Adresse fuer den Mitspieler-QR gefunden.");
      }

      this.board.playerJoinUrl.set(playerPageUrl);
      this.board.hostAccessUrls.set(runtimeInfo ? this.displayHostUrls(runtimeInfo.lanUrls, runtimeInfo.mdnsUrl, runtimeInfo.baseUrl) : []);
      this.board.hostPort.set(runtimeInfo?.port ?? null);
      this.board.playerQrDataUrl.set(await QRCode.toDataURL(playerPageUrl, {margin: 1, scale: 6}));
      this.board.connectToSession(hostGame.sessionId);
      this.board.isBoardReady.set(true);
    } catch (error) {
      this.board.bootErrorText.set(error instanceof Error ? error.message : "Host-Spielstand konnte nicht geladen werden.");
      this.board.isBoardReady.set(false);
    } finally {
      this.board.isBootstrapping.set(false);
    }
  }

  private displayHostUrls(lanUrls: string[], mdnsUrl: string, baseUrl: string): string[] {
    return [...new Set([...lanUrls, mdnsUrl, baseUrl])]
      .filter(url => !this.isLoopbackUrl(url))
      .slice(0, 3);
  }

  private selectHostPlayerJoinUrl(runtimeInfo: {playerJoinUrls: string[]} | null): string | null {
    if (!runtimeInfo) {
      return null;
    }
    return runtimeInfo.playerJoinUrls.find(url => !this.isLoopbackUrl(url)) ?? null;
  }

  private isLoopbackUrl(rawUrl: string): boolean {
    try {
      const hostname = new URL(rawUrl).hostname.toLowerCase();
      return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
    } catch {
      return true;
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
