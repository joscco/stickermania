import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import type {SessionInfo, SessionState, StickerAssetManifest} from "@birthday/shared";
import {firstValueFrom} from "rxjs";

export interface ResolvedSessionInfo {
  sessionId: string;
  sessionCode: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionSummary {
  sessionId: string;
  sessionCode: string;
  playerCount: number;
  createdAt: number;
  expiresAt: number;
}

export interface RuntimeInfo {
  mode: "cloud" | "dev" | "lan-host";
  baseUrl: string;
  port: number;
  mdnsUrl: string;
  lanUrls: string[];
  playerJoinUrls: string[];
  boardUrls: string[];
}

@Injectable({ providedIn: "root" })
export class SessionApiService {
  public constructor(private readonly httpClient: HttpClient) {}

  public listSessions(): Promise<SessionSummary[]> {
    return firstValueFrom(this.httpClient.get<SessionSummary[]>("/api/sessions"));
  }

  public createSession(): Promise<SessionInfo> {
    return firstValueFrom(this.httpClient.post<SessionInfo>("/api/sessions", { }));
  }

  public getOrCreateHostGame(): Promise<SessionInfo> {
    return firstValueFrom(this.httpClient.post<SessionInfo>("/api/host-game", {}));
  }

  public getRuntimeInfo(): Promise<RuntimeInfo> {
    return firstValueFrom(this.httpClient.get<RuntimeInfo>("/api/info"));
  }

  public resolveSessionByCode(sessionCode: string): Promise<ResolvedSessionInfo> {
    return firstValueFrom(
      this.httpClient.get<ResolvedSessionInfo>(`/api/sessions/by-code/${encodeURIComponent(sessionCode)}`),
    );
  }

  public deleteSession(sessionId: string): Promise<void> {
    return firstValueFrom(this.httpClient.delete<void>(`/api/sessions/${encodeURIComponent(sessionId)}`));
  }

  public getSessionState(sessionId: string): Promise<SessionState> {
    return firstValueFrom(this.httpClient.get<SessionState>(`/api/sessions/${encodeURIComponent(sessionId)}/state`));
  }

  public getSessionAssets(sessionId: string): Promise<Array<{type: "avatar" | "sticker"; filename: string; publicUrl: string}>> {
    return firstValueFrom(
      this.httpClient.get<Array<{type: "avatar" | "sticker"; filename: string; publicUrl: string}>>(
        `/api/sessions/${encodeURIComponent(sessionId)}/assets`,
      ),
    );
  }

  public getStickerManifest(sessionId: string): Promise<StickerAssetManifest> {
    return firstValueFrom(
      this.httpClient.get<StickerAssetManifest>(
        `/api/sessions/${encodeURIComponent(sessionId)}/sticker-manifest`,
      ),
    );
  }
}
