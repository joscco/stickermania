import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import type { GameState, SessionInfo } from "@birthday/shared";
import { firstValueFrom } from "rxjs";

export interface ResolvedSessionInfo {
  sessionId: string;
  sessionCode: string;
  createdAt: number;
  expiresAt: number;
}

@Injectable({ providedIn: "root" })
export class ApiService {
  public constructor(private readonly httpClient: HttpClient) {}

  public createSession(): Promise<SessionInfo> {
    return firstValueFrom(this.httpClient.post<SessionInfo>("/api/sessions", {}));
  }

  public resolveSessionByCode(sessionCode: string): Promise<ResolvedSessionInfo> {
    return firstValueFrom(
      this.httpClient.get<ResolvedSessionInfo>(
        `/api/sessions/by-code/${encodeURIComponent(sessionCode)}`,
      ),
    );
  }

  public getState(args: { sessionId: string; sinceRevision: number | null }): Promise<GameState | null> {
    const sinceRevision = args.sinceRevision ?? -1;
    return firstValueFrom(
      this.httpClient.get<GameState>(
        `/api/sessions/${encodeURIComponent(args.sessionId)}/state?sinceRevision=${encodeURIComponent(String(sinceRevision))}`,
        { observe: "response" },
      ),
    ).then((response) => {
      if (response.status === 204) {
        return null;
      }
      return response.body ?? null;
    });
  }

  public reset(sessionId: string): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>(`/api/sessions/${encodeURIComponent(sessionId)}/reset`, {}));
  }

  public deleteSession(sessionId: string): Promise<void> {
    return firstValueFrom(this.httpClient.delete<void>(`/api/sessions/${encodeURIComponent(sessionId)}`));
  }
}
