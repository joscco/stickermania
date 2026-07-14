import {Injectable} from "@angular/core";
import type {SessionInfo, SessionState, StickerAssetManifest} from "@stickermania/shared";
import {SessionApiService, type ResolvedSessionInfo, type RuntimeInfo, type SessionSummary} from "../api/session-api.service";
import {AppRuntimeService} from "./app-runtime.service";
import {LocalSessionRuntimeService} from "./local/local-session-runtime.service";

@Injectable({providedIn: "root"})
export class SessionRuntimeService {
  public constructor(
    private readonly appRuntime: AppRuntimeService,
    private readonly remoteApi: SessionApiService,
    private readonly localRuntime: LocalSessionRuntimeService,
  ) {}

  public listSessions(): Promise<SessionSummary[]> {
    return this.delegate().listSessions();
  }

  public createSession(): Promise<SessionInfo> {
    return this.delegate().createSession();
  }

  public resolveSessionByCode(sessionCode: string): Promise<ResolvedSessionInfo> {
    return this.delegate().resolveSessionByCode(sessionCode);
  }

  public deleteSession(sessionId: string): Promise<void> {
    return this.delegate().deleteSession(sessionId);
  }

  public getSessionState(sessionId: string): Promise<SessionState> {
    return this.delegate().getSessionState(sessionId);
  }

  public getSessionAssets(sessionId: string): Promise<Array<{type: "avatar" | "sticker"; filename: string; publicUrl: string}>> {
    return this.delegate().getSessionAssets(sessionId);
  }

  public getStickerManifest(sessionId: string): Promise<StickerAssetManifest> {
    return this.delegate().getStickerManifest(sessionId);
  }

  public isLocalBackupSupported(): boolean {
    return this.appRuntime.supportsLocalBackup();
  }

  public usesVisibleSessions(): boolean {
    return this.appRuntime.usesCloudSessions();
  }

  public usesLocalBrowserGame(): boolean {
    return this.appRuntime.usesLocalBrowserGame();
  }

  public usesHostGame(): boolean {
    return this.appRuntime.usesHostGame();
  }

  public supportsBoardScreen(): boolean {
    return this.appRuntime.supportsBoardScreen();
  }

  public supportsPlayerProfiles(): boolean {
    return this.appRuntime.supportsPlayerProfiles();
  }

  public supportsPlayerQr(): boolean {
    return this.appRuntime.supportsPlayerQr();
  }

  public showsSessionCode(): boolean {
    return this.appRuntime.showsSessionCode();
  }

  public getOrCreateLocalGame(): Promise<SessionInfo> {
    if (!this.appRuntime.usesLocalBrowserGame()) {
      return Promise.reject(new Error("Local game is only available in local-web mode."));
    }
    return this.localRuntime.getOrCreateLocalGame();
  }

  public getOrCreateHostGame(): Promise<SessionInfo> {
    if (!this.appRuntime.usesHostGame()) {
      return Promise.reject(new Error("Host game is only available in LAN host mode."));
    }
    return this.remoteApi.getOrCreateHostGame();
  }

  public getHostRuntimeInfo(): Promise<RuntimeInfo> {
    if (!this.appRuntime.usesHostGame()) {
      return Promise.reject(new Error("Host runtime info is only available in LAN host mode."));
    }
    return this.remoteApi.getRuntimeInfo();
  }

  public resetLocalGame(): Promise<SessionInfo> {
    if (!this.appRuntime.usesLocalBrowserGame()) {
      return Promise.reject(new Error("Local game reset is only available in local-web mode."));
    }
    return this.localRuntime.resetLocalGame();
  }

  public exportSessionBackup(sessionId: string): Promise<Blob> {
    if (!this.appRuntime.supportsLocalBackup()) {
      return Promise.reject(new Error("Local session backup is only available in local-web mode."));
    }
    return this.localRuntime.exportSessionBackup(sessionId);
  }

  public importSessionBackup(file: File): Promise<SessionSummary> {
    if (!this.appRuntime.supportsLocalBackup()) {
      return Promise.reject(new Error("Local session import is only available in local-web mode."));
    }
    return this.localRuntime.importSessionBackup(file);
  }

  private delegate(): SessionApiService | LocalSessionRuntimeService {
    return this.appRuntime.usesLocalBrowserGame() ? this.localRuntime : this.remoteApi;
  }
}
