import crypto from "node:crypto";
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientToServerMessage, ServerToClientMessage, SessionState } from "@birthday/shared";
import type { SessionService } from "../session/sessionService.js";

// ---------------------------------------------------------------------------
// Connected-client bookkeeping
// ---------------------------------------------------------------------------

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  sessionId: string;
  kind: "player" | "board";
  playerId: string;
}

const clients = new Map<string, ConnectedClient>();

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------

function sendToClient(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToSession(sessionId: string, message: ServerToClientMessage): void {
  const payload = JSON.stringify(message);

  for (const client of clients.values()) {
    if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function broadcastSessionState(sessionId: string, state: SessionState): void {
  broadcastToSession(sessionId, { type: "session-state", state });
}

// ---------------------------------------------------------------------------
// Disconnect helpers (used by REST endpoints)
// ---------------------------------------------------------------------------

export function disconnectSessionClients(sessionId: string): void {
  for (const [clientId, client] of clients.entries()) {
    if (client.sessionId === sessionId) {
      sendToClient(client.ws, { type: "error", message: "Session wurde gelöscht." });
      client.ws.close();
      clients.delete(clientId);
    }
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function createWebSocketHandler(
  server: http.Server,
  sessionService: SessionService,
  serverSessionId: string,
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    if (request.url === "/ws" || request.url?.startsWith("/ws?")) {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
    } else {
      socket.destroy();
    }
  });

  // --- Ping keep-alive -----------------------------------------------------

  const wsPingTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, 25_000);

  wss.on("close", () => clearInterval(wsPingTimer));

  // --- Event wiring ---------------------------------------------------------

  sessionService.setOnSessionStateChanged(async (sessionId, state) => {
    broadcastSessionState(sessionId, state);
  });

  sessionService.setOnSessionGameEvents(async (sessionId, events) => {
    for (const event of events) {
      broadcastToSession(sessionId, event);
    }
  });

  // --- Connection handler ---------------------------------------------------

  wss.on("connection", (ws: WebSocket) => {
    const clientId = crypto.randomUUID();

    ws.on("message", async (rawMessage) => {
      let parsedMessage: ClientToServerMessage | null = null;

      try {
        parsedMessage = JSON.parse(rawMessage.toString("utf-8")) as ClientToServerMessage;
      } catch {
        sendToClient(ws, { type: "error", message: "Ungültige Nachricht." });
        return;
      }

      if (!parsedMessage) {
        return;
      }

      // --- Join -------------------------------------------------------------

      if (parsedMessage.type === "join") {
        const joined = await sessionService.join({
          sessionId: parsedMessage.sessionId,
          clientId,
          kind: parsedMessage.kind,
          existingPlayerId: parsedMessage.playerId,
        });

        if (!joined) {
          sendToClient(ws, { type: "error", message: "Session nicht gefunden." });
          return;
        }

        clients.set(clientId, {
          ws,
          clientId,
          sessionId: joined.state.sessionId,
          kind: parsedMessage.kind,
          playerId: joined.player.id,
        });

        sendToClient(ws, {
          type: "welcome",
          clientId,
          playerId: joined.player.id,
          sessionId: joined.state.sessionId,
          serverTime: Date.now(),
          serverSessionId,
          assignedColors: [],
        });

        sendToClient(ws, {
          type: "session-state",
          state: joined.state,
        });

        return;
      }

      // --- Require connected client -----------------------------------------

      const connectedClient = clients.get(clientId);

      if (!connectedClient) {
        sendToClient(ws, { type: "error", message: "Nicht verbunden." });
        return;
      }

      // --- Dispatch by message type -----------------------------------------

      switch (parsedMessage.type) {
        case "set-name": {
          await sessionService.setPlayerName(connectedClient.sessionId, connectedClient.playerId, parsedMessage.name);
          return;
        }

        case "submit-avatar": {
          await sessionService.saveAvatar(connectedClient.sessionId, connectedClient.playerId, parsedMessage.avatarDataUrl);
          return;
        }

        case "select-mode": {
          await sessionService.selectMode(connectedClient.sessionId, parsedMessage.mode);
          return;
        }

        case "start-mode": {
          await sessionService.startMode(connectedClient.sessionId);
          return;
        }

        case "reset-session": {
          await sessionService.resetSession(connectedClient.sessionId);
          return;
        }

        case "game-action": {
          await sessionService.handleGameAction({
            sessionId: connectedClient.sessionId,
            clientId,
            playerId: connectedClient.playerId,
            clientKind: connectedClient.kind,
            message: parsedMessage,
          });
          return;
        }

        case "ping": {
          sendToClient(ws, {
            type: "pong",
            t: parsedMessage.t,
            serverTime: Date.now(),
          });
          return;
        }

        default: {
          sendToClient(ws, { type: "error", message: "Nicht unterstützte Nachricht." });
        }
      }
    });

    ws.on("close", () => {
      const connectedClient = clients.get(clientId);

      if (!connectedClient) {
        return;
      }

      sessionService.removeConnectionSession(connectedClient.sessionId, clientId);
      clients.delete(clientId);
    });
  });

  return wss;
}

