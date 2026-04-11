import type { ClientKind } from "@birthday/shared";

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
  connectedClients: Map<string, ConnectedClientSession>;
}