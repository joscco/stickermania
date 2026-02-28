import type {ClientToServerMessage, ServerToClientMessage} from "@birthday/shared";
import type {BackendConfig} from "../config.js";
import {WorldStore} from "../world/worldStore.js";

export interface HandleMessageResult {
    didChangeState: boolean;
    responseMessages: ServerToClientMessage[];
    broadcastMessages: ServerToClientMessage[];
}

export function handleMessage(args: {
    message: ClientToServerMessage;
    worldStore: WorldStore;
    backendConfig: BackendConfig;
    isAdminConnection: boolean;
}): HandleMessageResult {
    switch (args.message.type) {
        case "ping": {
            const t: number = typeof args.message.t === "number" ? args.message.t : Date.now();
            return {
                didChangeState: false,
                responseMessages: [{type: "pong", t, serverTime: Date.now()}],
                broadcastMessages: []
            };
        }

        case "join": {
            return {
                didChangeState: false,
                responseMessages: [{ type: "state", state: args.worldStore.getState() }],
                broadcastMessages: []
            };
        }

        case "reset": {
            if (!args.isAdminConnection) {
                return {
                    didChangeState: false,
                    responseMessages: [{ type: "error", message: "Reset requires admin" }],
                    broadcastMessages: []
                };
            }

            args.worldStore.reset({
                gridWidth: args.backendConfig.gridWidth,
                gridHeight: args.backendConfig.gridHeight
            });

            return {
                didChangeState: true,
                responseMessages: [],
                broadcastMessages: [{ type: "event", text: "🧽 World reset", createdAt: Date.now() }]
            };
        }

        case "place": {
            args.worldStore.place({
                x: args.message.x,
                y: args.message.y,
                objectType: args.message.objectType
            });

            return {
                didChangeState: true,
                responseMessages: [],
                broadcastMessages: [{
                    type: "event",
                    text: `➕ ${args.message.objectType} platziert (${args.message.x},${args.message.y})`,
                    createdAt: Date.now()
                }]
            };
        }

        case "remove": {
            const didRemove: boolean = args.worldStore.remove({
                x: args.message.x,
                y: args.message.y
            });

            return {
                didChangeState: didRemove,
                responseMessages: [],
                broadcastMessages: didRemove
                    ? [{ type: "event", text: `➖ gelöscht (${args.message.x},${args.message.y})`, createdAt: Date.now() }]
                    : []
            };
        }

        default: {
            return {
                didChangeState: false,
                responseMessages: [{type: "error", message: "Unknown message type"}],
                broadcastMessages: []
            };
        }
    }
}