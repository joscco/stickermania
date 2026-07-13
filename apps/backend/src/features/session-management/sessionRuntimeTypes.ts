import type { ClientKind } from "@birthday/shared";

export interface ConnectedClientSession {
  playerId: string;
  clientId: string;
  kind: ClientKind;
  connectedAt: number;
}

export interface RuntimeEntry {
  sessionRuntime: SessionRuntime;
}

export interface SessionRuntime {
  connectedClients: Map<string, ConnectedClientSession>;
}
