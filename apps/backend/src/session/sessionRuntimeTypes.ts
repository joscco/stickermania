import type { ClientKind, GameModeId } from "@birthday/shared";

export interface ConnectedClientSession {
  playerId: string;
  clientId: string;
  kind: ClientKind;
  connectedAt: number;
}

export interface RuntimeEntry {
  sessionRuntime: SessionRuntime;
  phaseTimer: ReturnType<typeof setTimeout> | null;
}

export interface SessionRuntime {
  activeMode: GameModeId;
  connectedClients: Map<string, ConnectedClientSession>;
}