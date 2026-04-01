import { Injectable } from "@angular/core";
import type { ActivatedRoute } from "@angular/router";

const RECONNECT_STORAGE_KEY = "birthday_reconnect";

export interface ReconnectPayload {
  playerId: string;
  sessionId: string;
  sessionCode: string;
  playerName: string;
}

@Injectable({ providedIn: "root" })
export class ReconnectService {
  public load(): ReconnectPayload | null {
    try {
      const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.playerId && parsed?.sessionId && parsed?.sessionCode) {
        return parsed as ReconnectPayload;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  public save(payload: ReconnectPayload): void {
    localStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify(payload));
  }

  public update(partial: Partial<ReconnectPayload>): void {
    const existing = this.load();
    const updated: ReconnectPayload = {
      playerId: partial.playerId ?? existing?.playerId ?? "",
      sessionId: partial.sessionId ?? existing?.sessionId ?? "",
      sessionCode: partial.sessionCode ?? existing?.sessionCode ?? "",
      playerName: partial.playerName ?? existing?.playerName ?? "",
    };
    if (updated.playerId && updated.sessionId) {
      this.save(updated);
    }
  }

  /** Remove all stored reconnect data (e.g. when the session is deleted). */
  public clear(): void {
    localStorage.removeItem(RECONNECT_STORAGE_KEY);
    localStorage.removeItem("birthday_last_session_code");
  }

  /**
   * Resolve the session code from the route query param or localStorage.
   */
  public resolveSessionCode(route: ActivatedRoute): string | null {
    const routeCode = route.snapshot.queryParamMap.get("session");
    if (routeCode?.trim()) {
      return routeCode.trim().toUpperCase();
    }
    return localStorage.getItem("birthday_last_session_code")?.trim().toUpperCase() ?? null;
  }
}

