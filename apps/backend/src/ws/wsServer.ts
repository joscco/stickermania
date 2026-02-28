import WebSocket, { WebSocketServer } from "ws";
import type http from "node:http";
import crypto from "node:crypto";
import type { ClientToServerMessage, ServerToClientMessage } from "@birthday/shared";
import { handleMessage } from "./handleMessage.js";
import type { BackendConfig } from "../config.js";
import { saveWorldToDisk } from "../world/persistence.js";
import { WorldStore } from "../world/worldStore.js";

function send(ws: WebSocket, message: ServerToClientMessage): void {
    ws.send(JSON.stringify(message));
}

function broadcastState(args: { wss: WebSocketServer; worldStore: WorldStore }): void {
    const message: ServerToClientMessage = { type: "state", state: args.worldStore.getState() };
    const payload: string = JSON.stringify(message);

    for (const client of args.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

function broadcast(args: { wss: WebSocketServer; message: ServerToClientMessage }): void {
    const payload: string = JSON.stringify(args.message);
    for (const client of args.wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

function isValidMessageShape(message: any): message is ClientToServerMessage {
    return typeof message === "object" && message !== null && typeof message.type === "string";
}

export function attachWebSocketServer(args: {
    server: http.Server;
    backendConfig: BackendConfig;
    worldStore: WorldStore;
}): WebSocketServer {
    const wss = new WebSocketServer({ server: args.server, path: "/ws" });

    wss.on("connection", (ws) => {
        let isAdminConnection: boolean = false;
        const clientId: string = crypto.randomUUID();

        send(ws, { type: "welcome", clientId, serverTime: Date.now() });
        send(ws, { type: "state", state: args.worldStore.getState() });

        ws.on("message", (data) => {
            let parsed: any;
            try {
                parsed = JSON.parse(data.toString());
            } catch {
                send(ws, { type: "error", message: "Invalid JSON" });
                return;
            }

            if (!isValidMessageShape(parsed)) {
                send(ws, { type: "error", message: "Invalid message shape" });
                return;
            }

            if (parsed.type === "join") {
                const receivedAdminKey: string | undefined = parsed.adminKey;
                if (receivedAdminKey && args.backendConfig.adminPassword) {
                    if (receivedAdminKey === args.backendConfig.adminPassword) {
                        isAdminConnection = true;
                    }
                }
            }

            const result = handleMessage({
                message: parsed,
                worldStore: args.worldStore,
                backendConfig: args.backendConfig,
                isAdminConnection
            });

            for (const responseMessage of result.responseMessages) {
                send(ws, responseMessage);
            }

            for (const broadcastMessage of result.broadcastMessages) {
                broadcast({ wss, message: broadcastMessage });
            }

            if (result.didChangeState) {
                saveWorldToDisk({
                    persistPath: args.backendConfig.persistPath,
                    worldState: args.worldStore.getState()
                });

                broadcastState({ wss, worldStore: args.worldStore });
            }
        });
    });

    return wss;
}