import { Injectable } from "@angular/core";
import type { ActivatedRoute } from "@angular/router";

const RECONNECT_STORAGE_KEY = "birthday_reconnect";
const DEVICE_NAME_KEY = "birthday_device_player_name";
const DEVICE_AVATAR_KEY = "birthday_device_player_avatar";

export interface ReconnectPayload {
  /** Server-assigned player UUID — used to reclaim the same player slot on rejoin. */
  playerId: string;
  /** Server-assigned session UUID — used to verify the player belongs to this session. */
  sessionId: string;
}

@Injectable({ providedIn: "root" })
export class ReconnectService {
  public load(): ReconnectPayload | null {
    try {
      const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.playerId && parsed?.sessionId) {
        return { playerId: parsed.playerId, sessionId: parsed.sessionId };
      }
    } catch { /* ignore */ }
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
    };
    if (updated.playerId && updated.sessionId) {
      this.save(updated);
    }
  }

  /** Remove all stored reconnect data (e.g. when the session is deleted). */
  public clear(): void {
    localStorage.removeItem(RECONNECT_STORAGE_KEY);
  }

  /** Resolve the session code from the route query param only — no localStorage fallback. */
  public resolveSessionCode(route: ActivatedRoute): string | null {
    const routeCode = route.snapshot.queryParamMap.get("session");
    return routeCode?.trim().toUpperCase() ?? null;
  }

  // ── Device-level identity (survives session changes) ──────────

  public saveDeviceName(name: string): void {
    localStorage.setItem(DEVICE_NAME_KEY, name);
  }

  public loadDeviceName(): string | null {
    return localStorage.getItem(DEVICE_NAME_KEY) || null;
  }

  /** Legacy cleanup: avatars are session data and must not be restored from device storage. */
  public clearDeviceAvatar(): void {
    localStorage.removeItem(DEVICE_AVATAR_KEY);
  }
}
