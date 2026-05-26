import crypto from "node:crypto";
import type {ClientToServerMessage, ServerToClientMessage, SessionState} from "@birthday/shared";
import type {FastifyInstance} from "fastify";
import type {SessionService} from "../session/sessionService.js";

interface WsSocket {
    readyState: number;
    send(data: string): void;
    ping(): void;
    close(): void;
    on(event: "message", listener: (data: Buffer) => void): void;
    on(event: "close", listener: () => void): void;
    on(event: string, listener: (...args: any[]) => void): void;
}

interface ConnectedClient {
    ws: WsSocket;
    clientId: string;
    sessionId: string;
    kind: "player" | "board";
    playerId: string;
}

const clients = new Map<string, ConnectedClient>();

function sendToClient(ws: WsSocket, message: ServerToClientMessage): void {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(message));
    }
}

function broadcastToSession(sessionId: string, message: ServerToClientMessage): void {
    const payload = JSON.stringify(message);
    for (const client of clients.values()) {
        if (client.sessionId === sessionId && client.ws.readyState === 1) {
            client.ws.send(payload);
        }
    }
}

function broadcastSessionState(sessionId: string, state: SessionState): void {
    broadcastToSession(sessionId, {type: "session-state", state});
}

export function disconnectSessionClients(sessionId: string): void {
    for (const [clientId, client] of clients.entries()) {
        if (client.sessionId === sessionId) {
            sendToClient(client.ws, {type: "error", message: "Session wurde gelöscht."});
            client.ws.close();
            clients.delete(clientId);
        }
    }
}

export async function registerWebSocket(
    app: FastifyInstance,
    sessionService: SessionService,
    serverSessionId: string,
): Promise<void> {

    // ─── Ping keep-alive ────────────────────────────────────────

    const pingTimer = setInterval(() => {
        for (const client of clients.values()) {
            if (client.ws.readyState === 1) {
                client.ws.ping();
            }
        }
    }, 25_000);

    app.addHook("onClose", () => clearInterval(pingTimer));

    // ─── Session-service event callbacks ────────────────────────

    sessionService.setOnSessionStateChanged(async (sessionId, state) => {
        broadcastSessionState(sessionId, state);
    });

    sessionService.setOnSessionGameEvents(async (sessionId, events) => {
        for (const event of events) {
            if (event.targetPlayerId) {
                for (const client of clients.values()) {
                    if (client.sessionId === sessionId && client.playerId === event.targetPlayerId && client.ws.readyState === 1) {
                        client.ws.send(JSON.stringify(event));
                    }
                }
            } else {
                broadcastToSession(sessionId, event);
            }
        }
    });

    // ─── WebSocket route ────────────────────────────────────────

    app.get("/ws", {websocket: true}, (socket) => {
        const ws = socket as unknown as WsSocket;
        const clientId = crypto.randomUUID();

        ws.on("message", async (rawMessage: Buffer) => {
            let parsedMessage: ClientToServerMessage;

            try {
                parsedMessage = JSON.parse(rawMessage.toString("utf-8")) as ClientToServerMessage;
            } catch {
                sendToClient(ws, {type: "error", message: "Ungültige Nachricht."});
                return;
            }

            // ── Join ──────────────────────────────────────────

            if (parsedMessage.type === "join") {
                const joined = await sessionService.join({
                    sessionId: parsedMessage.sessionId,
                    clientId,
                    kind: parsedMessage.kind,
                    existingPlayerId: parsedMessage.playerId,
                });

                if (!joined) {
                    sendToClient(ws, {type: "error", message: "Session nicht gefunden."});
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
                });

                sendToClient(ws, {type: "session-state", state: joined.state});

                // Send game events directly to the joining client (not yet in the clients map during join)
                for (const event of joined.gameEvents) {
                    const envelope: ServerToClientMessage = {type: "game-event", event};
                    sendToClient(ws, envelope);
                }

                return;
            }

            // ── Require connected client ──────────────────────

            const connectedClient = clients.get(clientId);
            if (!connectedClient) {
                sendToClient(ws, {type: "error", message: "Nicht verbunden."});
                return;
            }

            // ── Dispatch by message type ──────────────────────

            switch (parsedMessage.type) {
                case "set-name":
                    await sessionService.setPlayerName(connectedClient.sessionId, connectedClient.playerId, parsedMessage.name);
                    return;

                case "submit-avatar":
                    await sessionService.saveAvatar(connectedClient.sessionId, connectedClient.playerId, parsedMessage.avatarDataUrl);
                    return;

                case "start-game-session":
                    await sessionService.startGameSession(connectedClient.sessionId);
                    return;

                case "reset-session":
                    await sessionService.resetSession(connectedClient.sessionId);
                    return;

                case "game-action":
                    await sessionService.handleGameAction({
                        sessionId: connectedClient.sessionId,
                        clientId,
                        playerId: connectedClient.playerId,
                        clientKind: connectedClient.kind,
                        message: parsedMessage,
                    });
                    return;

                case "ping":
                    sendToClient(ws, {type: "pong", t: parsedMessage.t, serverTime: Date.now()});
                    return;

                default:
                    sendToClient(ws, {type: "error", message: "Nicht unterstützte Nachricht."});
            }
        });

        ws.on("close", async () => {
            const connectedClient = clients.get(clientId);
            if (!connectedClient) {
                return;
            }

            sessionService.removeConnectionSession(connectedClient.sessionId, clientId);
            clients.delete(clientId);

            try {
                await sessionService.markPlayerDisconnected(connectedClient.sessionId, connectedClient.playerId);
            } catch {
                // best-effort
            }
        });
    });
}
