import { Injectable, computed, signal } from "@angular/core";
import type { ServerToClientMessage, WorldState } from "@birthday/shared";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

@Injectable({ providedIn: "root" })
export class WorldStore {
  public readonly connectionStatus = signal<ConnectionStatus>("connecting");
  public readonly world = signal<WorldState | null>(null);
  public readonly lastError = signal<string | null>(null);

  public readonly revision = computed(() => this.world()?.revision ?? null);

  public setConnected(): void {
    this.connectionStatus.set("connected");
    this.lastError.set(null);
  }

  public setConnecting(): void {
    this.connectionStatus.set("connecting");
  }

  public setDisconnected(): void {
    this.connectionStatus.set("disconnected");
  }

  public setError(message: string): void {
    this.lastError.set(message);
  }

  public handleServerMessage(message: ServerToClientMessage): void {
    if (message.type === "state") {
      this.world.set(message.state);
      this.lastError.set(null);
      return;
    }

    if (message.type === "error") {
      this.lastError.set(message.message);
      return;
    }
  }
}
