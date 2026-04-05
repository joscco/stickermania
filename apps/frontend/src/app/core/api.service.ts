import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import type { GameModeId, SessionInfo, SessionState } from "@birthday/shared";
import { firstValueFrom } from "rxjs";

export interface ResolvedSessionInfo {
  sessionId: string;
  sessionCode: string;
  createdAt: number;
  expiresAt: number;
}

export interface SessionSummary {
  sessionId: string;
  sessionCode: string;
  activeMode: GameModeId;
  playerCount: number;
  createdAt: number;
  expiresAt: number;
}

@Injectable({ providedIn: "root" })
export class ApiService {
  public constructor(private readonly httpClient: HttpClient) {}

  public listSessions(): Promise<SessionSummary[]> {
    return firstValueFrom(this.httpClient.get<SessionSummary[]>("/api/sessions"));
  }

  public createSession(mode: GameModeId = "sticker-collage"): Promise<SessionInfo> {
    return firstValueFrom(this.httpClient.post<SessionInfo>("/api/sessions", { mode }));
  }

  public resolveSessionByCode(sessionCode: string): Promise<ResolvedSessionInfo> {
    return firstValueFrom(
      this.httpClient.get<ResolvedSessionInfo>(`/api/sessions/by-code/${encodeURIComponent(sessionCode)}`),
    );
  }

  public deleteSession(sessionId: string): Promise<void> {
    return firstValueFrom(this.httpClient.delete<void>(`/api/sessions/${encodeURIComponent(sessionId)}`));
  }

  public uploadCollageImage(sessionId: string, playerId: string, collageId: string, imageDataUrl: string): Promise<{ok: boolean; publicUrl: string}> {
    return firstValueFrom(
      this.httpClient.post<{ok: boolean; publicUrl: string}>(
        `/api/sessions/${encodeURIComponent(sessionId)}/collage-image`,
        {playerId, collageId, imageDataUrl},
      ),
    );
  }
}
