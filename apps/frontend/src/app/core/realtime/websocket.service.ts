import { Injectable, signal } from "@angular/core";
import type { ClientToServerMessage, ServerToClientMessage } from "@stickermania/shared";

/**
 * idle         – connect() has never been called
 * connecting   – WebSocket handshake in progress or auto-reconnecting
 * connected    – WebSocket is open
 * disconnected – intentionally disconnected (e.g. session deleted), no reconnect
 */
export type WsConnectionStatus = "idle" | "connecting" | "connected" | "disconnected";

@Injectable({ providedIn: "root" })
export class WebSocketService {
  public readonly status = signal<WsConnectionStatus>("idle");

  /** True once the WebSocket was connected at least once. Never resets to false. */
  public readonly wasConnected = signal(false);

  /**
   * Native file/camera pickers often background the browser on mobile.
   * While active, keep the current player UI visible and reconnect silently.
   */
  public readonly externalPickerActive = signal(false);


  private ws: WebSocket | null = null;
  private messageListeners: Array<(msg: ServerToClientMessage) => void> = [];

  /**
   * Monotonically increasing ID — every call to connect() bumps this.
   * Old sockets check their generation and bail out if stale.
   */
  private generation = 0;

  /** Reconnect book-keeping */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalDisconnect = false;

  /**
   * The most recent join message. Automatically re-sent on reconnect
   * so the server re-registers us.
   */
  private pendingJoinMsg: ClientToServerMessage | null = null;

  /** Timeout for the WebSocket handshake — if onopen doesn't fire in time we retry */
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Ping / keep-alive */
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongAt = 0;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => this.handleVisibilityChange());
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", (e: PageTransitionEvent) => {
        if (e.persisted) this.handleVisibilityChange();
      });
    }
  }

  // ─── Public API ─────────────────────────────────────────────

  public connect(): void {
    this.teardown();
    this.intentionalDisconnect = false;

    const gen = ++this.generation;
    this.status.set("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    // Safari on iOS can hang the WebSocket handshake indefinitely.
    // If onopen hasn't fired within 5 s, tear down and retry.
    this.connectTimeout = setTimeout(() => {
      this.connectTimeout = null;
      if (gen !== this.generation) return;
      console.warn("[ws] connect timeout (5 s) — retrying");
      this.teardown();
      this.scheduleReconnect();
    }, 5_000);

    ws.onopen = () => {
      if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
      if (gen !== this.generation) { ws.close(); return; }
      this.reconnectAttempt = 0;
      this.status.set("connected");
      this.wasConnected.set(true);
      this.startPing();

      // Re-send the join message so the server re-registers us
      if (this.pendingJoinMsg) {
        this.sendRaw(this.pendingJoinMsg);
      }
    };

    ws.onmessage = (event) => {
      if (gen !== this.generation) return;
      try {
        const msg: ServerToClientMessage = JSON.parse(event.data);

        // Handle pong internally — don't propagate to listeners
        if (msg.type === "pong") {
          this.lastPongAt = Date.now();
          return;
        }

        for (const listener of this.messageListeners) {
          listener(msg);
        }
      } catch {
        // ignore malformed JSON
      }
    };

    ws.onclose = () => {
      if (gen !== this.generation) return;
      this.stopPing();
      this.ws = null;
      if (this.intentionalDisconnect) {
        this.status.set("disconnected");
      } else {
        // Go straight to "connecting" — no flicker through "disconnected"
        this.scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror — nothing extra needed
    };
  }

  /**
   * Intentional disconnect — stops reconnect loop and stays disconnected.
   */
  public disconnect(): void {
    this.intentionalDisconnect = true;
    this.pendingJoinMsg = null; // clear stale join so reconnect won't re-send it
    this.teardown();
    this.generation++;
    this.status.set("disconnected");
  }

  /**
   * Send a message. If it's a "join" message we store it as
   * pendingJoinMsg so reconnects can re-send it automatically.
   */
  public send(msg: ClientToServerMessage): void {
    if (msg.type === "join") {
      this.pendingJoinMsg = msg;
    }
    this.sendRaw(msg);
  }

  /**
   * Update the cached join message without sending it.
   * Used after receiving 'welcome' to ensure reconnects use the correct playerId.
   */
  public updatePendingJoin(msg: ClientToServerMessage): void {
    if (msg.type === "join") {
      this.pendingJoinMsg = msg;
    }
  }

  public setExternalPickerActive(active: boolean): void {
    this.externalPickerActive.set(active);
  }

  public onMessage(listener: (msg: ServerToClientMessage) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    };
  }

  // ─── Internals ──────────────────────────────────────────────

  private sendRaw(msg: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Close the current socket (nulling handlers so it can't interfere)
   * and clear the reconnect timer + ping interval.
   */
  private teardown(): void {
    this.stopPing();
    this.clearReconnectTimer();
    if (this.connectTimeout) { clearTimeout(this.connectTimeout); this.connectTimeout = null; }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  // ─── Reconnect ──────────────────────────────────────────────

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    // 0 ms → 500 ms → 1 s → 2 s → ... capped at 8 s
    const delay = this.reconnectAttempt === 0
      ? 0
      : Math.min(8_000, 500 * Math.pow(2, this.reconnectAttempt - 1));
    this.reconnectAttempt++;
    this.status.set("connecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ─── Ping / keep-alive ─────────────────────────────────────

  private startPing(): void {
    this.stopPing();
    this.lastPongAt = Date.now();
    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      if (Date.now() - this.lastPongAt > 45_000) {
        console.warn("[ws] no pong in 45 s — forcing reconnect");
        this.teardown();
        this.scheduleReconnect();
        return;
      }

      this.sendRaw({ type: "ping", t: Date.now() });
    }, 15_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ─── Visibility change (mobile sleep / wake) ───────────────

  private handleVisibilityChange(): void {
    if (document.visibilityState !== "visible") return;

    // Don't auto-reconnect if we intentionally disconnected (session change, etc.)
    if (this.intentionalDisconnect) return;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Socket is dead — reconnect immediately
      console.log("[ws] visibility: socket dead — reconnecting");
      this.teardown();
      this.reconnectAttempt = 0;
      this.connect();
    } else {
      // Socket looks open but might be stale (common on Safari).
      // Probe with a ping and check for pong.
      console.log("[ws] visibility: socket looks open — probing");
      this.status.set("connecting");
      const sentAt = Date.now();
      this.sendRaw({ type: "ping", t: sentAt });

      setTimeout(() => {
        if (this.lastPongAt >= sentAt) {
          console.log("[ws] visibility: pong received — alive");
          this.status.set("connected");
        } else {
          console.warn("[ws] visibility: no pong — forcing reconnect");
          this.teardown();
          this.reconnectAttempt = 0;
          this.connect();
        }
      }, 500);
    }
  }
}
