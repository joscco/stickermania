import type { WorldState } from "@birthday/shared";

export interface AppState {
  connectionStatus: "connecting" | "connected" | "disconnected";
  world: WorldState | null;
  lastError: string | null;
}

type Listener = (state: AppState) => void;

export class Store {
  private state: AppState = {
    connectionStatus: "connecting",
    world: null,
    lastError: null
  };

  private listeners: Listener[] = [];

  public getState(): AppState {
    return this.state;
  }

  public setState(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    listener(this.state);

    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
