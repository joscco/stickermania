import type { ClientToServerMessage, ServerToClientMessage } from "@birthday/shared";

export interface WsClientOptions {
  websocketUrl: string;
  kind: "player" | "board";
}

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly websocketUrl: string;
  private readonly kind: "player" | "board";

  public onMessage: ((message: ServerToClientMessage) => void) | null = null;
  public onOpen: (() => void) | null = null;
  public onClose: (() => void) | null = null;
  public onError: ((error: Event) => void) | null = null;

  public constructor(options: WsClientOptions) {
    this.websocketUrl = options.websocketUrl;
    this.kind = options.kind;
  }

  public connect(): void {
    if (this.ws) {
      return;
    }

    this.ws = new WebSocket(this.websocketUrl);

    this.ws.addEventListener("open", () => {
      this.send({ type: "join", kind: this.kind });
      if (this.onOpen) {
        this.onOpen();
      }
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const message: ServerToClientMessage = JSON.parse(String(event.data));
        if (this.onMessage) {
          this.onMessage(message);
        }
      } catch {
        // ignore
      }
    });

    this.ws.addEventListener("close", () => {
      this.ws = null;
      if (this.onClose) {
        this.onClose();
      }
    });

    this.ws.addEventListener("error", (error) => {
      if (this.onError) {
        this.onError(error);
      }
    });
  }

  public disconnect(): void {
    if (!this.ws) {
      return;
    }
    this.ws.close();
    this.ws = null;
  }

  public send(message: ClientToServerMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
