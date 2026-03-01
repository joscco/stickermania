import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import type { WorldState, ObjectType } from "@birthday/shared";
import { firstValueFrom } from "rxjs";

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

  public place(args: { x: number; y: number; objectType: ObjectType; rotationDeg?: number; scale?: number }): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>("/api/place", args));
  }

  public reset(): Promise<void> {
    return firstValueFrom(this.httpClient.post<void>("/api/reset", {}));
  }
}
