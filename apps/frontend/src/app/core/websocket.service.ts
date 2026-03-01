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

  constructor(private readonly ngZone: NgZone) {}

  public connect(): void {
    if (this.ws) return;
    this.status.set("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ngZone.run(() => this.status.set("connected"));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerToClientMessage = JSON.parse(event.data);
        this.ngZone.run(() => {
          this.lastMessage.set(msg);
          for (const listener of this.messageListeners) {
            listener(msg);
          }
        });
      } catch {
        // ignore invalid JSON
      }
    };

    this.ws.onclose = () => {
      this.ngZone.run(() => {
        this.ws = null;
        this.status.set("disconnected");
        this.scheduleReconnect();
      });
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  public send(msg: ClientToServerMessage): void {
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }
}

