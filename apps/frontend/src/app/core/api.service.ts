import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import type { WorldState, ObjectType } from "@birthday/shared";
import { firstValueFrom } from "rxjs";

export interface ChallengeStateDto {
  revision: number;
  activeChallenge: null | { id: string; text: string; endsAt: number; createdAt: number };
  activeSubmission: null | {
    id: string;
    challengeId: string;
    createdAt: number;
    endsAt: number;
    snapshotWorld: any;
    screenshotDataUrl?: string | null; // <-- DAS hier hinzufügen
    yesVotes: number;
    noVotes: number;
    status: "OPEN" | "ACCEPTED" | "REJECTED";
  };
}

@Injectable({ providedIn: "root" })
export class ApiService {
  public constructor(private readonly httpClient: HttpClient) {}

  public getState(args: { sinceRevision: number | null }): Promise<WorldState | null> {
    const sinceRevision: number = args.sinceRevision ?? -1;

    return firstValueFrom(
      this.httpClient.get<WorldState>(`/api/state?sinceRevision=${encodeURIComponent(String(sinceRevision))}`, {
        observe: "response"
      })
    ).then((response) => {
      if (response.status === 204) {
        return null;
      }
      return response.body ?? null;
    });
  }

  public getChallengeState(args: { sinceRevision: number | null }): Promise<ChallengeStateDto | null> {
    const sinceRevision: number = args.sinceRevision ?? -1;

    return firstValueFrom(
      this.httpClient.get<ChallengeStateDto>(`/api/challenge-state?sinceRevision=${encodeURIComponent(String(sinceRevision))}`, {
        observe: "response"
      })
    ).then((response) => {
      if (response.status === 204) {
        return null;
      }
      return response.body ?? null;
    });
  }

  public submitSnapshot(args: { voterId: string; screenshotDataUrl?: string | null }): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>("/api/submit", args));
  }

  public vote(args: { submissionId: string; voterId: string; vote: boolean }): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>("/api/vote", args));
  }

  public startChallenge(args: { text: string; durationMs?: number }): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>("/api/challenge/start", args));
  }

  public place(args: { x: number; y: number; objectType: ObjectType; rotationDeg?: number; scale?: number }): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>("/api/place", args));
  }

  public reset(): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>("/api/reset", {}));
  }
}
