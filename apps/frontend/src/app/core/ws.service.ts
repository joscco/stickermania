import { Injectable } from "@angular/core";
import type { ClientToServerMessage, ServerToClientMessage } from "@birthday/shared";

@Injectable({ providedIn: "root" })
export class WsService {
  private websocket: WebSocket | null = null;

  public connect(args: {
    websocketUrl: string;
    onOpen: () => void;
    onClose: () => void;
    onError: (event: Event) => void;
    onMessage: (message: ServerToClientMessage) => void;
  }): void {
    if (this.websocket) {
      return;
    }

    this.websocket = new WebSocket(args.websocketUrl);

    this.websocket.addEventListener("open", () => {
      args.onOpen();
    });

    this.websocket.addEventListener("close", () => {
      this.websocket = null;
      args.onClose();
    });

    this.websocket.addEventListener("error", (event) => {
      args.onError(event);
    });

    this.websocket.addEventListener("message", (event) => {
      try {
        const parsed: ServerToClientMessage = JSON.parse(String(event.data));
        args.onMessage(parsed);
      } catch {
        // ignore invalid server messages
      }
    });
  }

  public disconnect(): void {
    if (!this.websocket) {
      return;
    }
    this.websocket.close();
    this.websocket = null;
  }

  public send(message: ClientToServerMessage): void {
    if (!this.websocket) {
      return;
    }
    if (this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.websocket.send(JSON.stringify(message));
  }

  public isConnected(): boolean {
    return this.websocket !== null && this.websocket.readyState === WebSocket.OPEN;
  }
}
