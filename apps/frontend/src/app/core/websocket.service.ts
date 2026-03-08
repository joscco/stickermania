import { Injectable, signal, NgZone } from "@angular/core";
import type { ClientToServerMessage, ServerToClientMessage } from "@birthday/shared";

export type WsConnectionStatus = "connecting" | "connected" | "disconnected";

@Injectable({ providedIn: "root" })
export class WebSocketService {
  public readonly status = signal<WsConnectionStatus>("disconnected");
  public readonly lastMessage = signal<ServerToClientMessage | null>(null);

  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageListeners: Array<(msg: ServerToClientMessage) => void> = [];

  /** Ping / keep-alive interval handle */
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  /** Timestamp of last pong received */
  private lastPongAt = 0;
  /** How many consecutive reconnect attempts (for exponential back-off) */
  private reconnectAttempts = 0;

  /**
   * The most recent join message. When we reconnect we automatically
   * re-send this so the server knows who we are again.
   */
  private pendingJoinMsg: ClientToServerMessage | null = null;

  /** Bound handler for visibilitychange */
  private readonly onVisChange = () => this.handleVisibilityChange();

  constructor(private readonly ngZone: NgZone) {
    // When the phone locks/unlocks the screen or the user switches apps,
    // the WS may silently die. Re-check on visibility change.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisChange);
    }
  }

  public connect(): void {
    // Tear down any existing socket first (prevents ghost connections)
    this.destroySocket();

    this.status.set("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this.ngZone.run(() => {
        this.status.set("disconnected");
        this.scheduleReconnect();
      });
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.ngZone.run(() => {
        this.reconnectAttempts = 0;
        this.status.set("connected");
        this.startPing();

        // Re-send the join message so the server re-registers us
        if (this.pendingJoinMsg) {
          this.sendRaw(this.pendingJoinMsg);
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerToClientMessage = JSON.parse(event.data);
        this.ngZone.run(() => {
          if (msg.type === "pong") {
            this.lastPongAt = Date.now();
            return; // don't propagate pong to listeners
          }
          this.lastMessage.set(msg);
          for (const listener of this.messageListeners) {
            listener(msg);
          }
        });
      } catch {
        // ignore invalid JSON
      }
    };

    ws.onclose = () => {
      this.ngZone.run(() => {
        this.cleanupSocket();
        this.status.set("disconnected");
        this.scheduleReconnect();
      });
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  /**
   * Send a message. If it's a "join" message, we also store it so we
   * can automatically re-send it on reconnect.
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

  private sendRaw(msg: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public onMessage(listener: (msg: ServerToClientMessage) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== listener);
    };
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.destroySocket();
  }

  // ──────── Internals ────────

  /** Remove ping interval and null out ws without calling close() */
  private cleanupSocket(): void {
    this.stopPing();
    this.ws = null;
  }

  /** Close and clean up the existing socket */
  private destroySocket(): void {
    this.stopPing();
    if (this.ws) {
      // Remove event handlers to prevent re-entrant reconnect
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // Exponential back-off: 500ms, 1s, 2s, 4s, … capped at 8s
    const delay = Math.min(8000, 500 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // ──────── Ping / keep-alive ────────

  private startPing(): void {
    this.stopPing();
    this.lastPongAt = Date.now();
    this.pingInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // If we haven't received a pong in 10 s, the connection is dead
      if (Date.now() - this.lastPongAt > 10_000) {
        console.warn("[ws] no pong in 10 s — forcing reconnect");
        this.destroySocket();
        this.ngZone.run(() => {
          this.status.set("disconnected");
          this.scheduleReconnect();
        });
        return;
      }

      this.sendRaw({ type: "ping", t: Date.now() });
    }, 4_000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ──────── Visibility change (mobile sleep / wake) ────────

  private handleVisibilityChange(): void {
    if (document.visibilityState === "visible") {
      // Screen just became visible again — check connection health
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // Socket is dead; reconnect immediately
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        this.reconnectAttempts = 0;
        this.connect();
      } else {
        // Socket looks open but might be stale. Send a ping; if no pong
        // arrives the normal keep-alive will catch it.
        this.sendRaw({ type: "ping", t: Date.now() });
      }
    }
  }
}

