import type {ClientToServerMessage, ServerToClientMessage} from "@birthday/shared";
import type {BackendConfig} from "../config";
import {WorldStore} from "../world/worldStore";

export interface HandleMessageResult {
    didChangeState: boolean;
    responseMessages: ServerToClientMessage[];
}

export function handleMessage(args: { message: ClientToServerMessage; worldStore: WorldStore; backendConfig: BackendConfig; }): HandleMessageResult {
    switch (args.message.type) {
        case "join": {
            return {
                didChangeState: false,
                responseMessages: [{type: "state", state: args.worldStore.getState()}]
            };
        }

        case "ping": {
            const t: number = typeof args.message.t === "number" ? args.message.t : Date.now();
            return {
                didChangeState: false,
                responseMessages: [{type: "pong", t, serverTime: Date.now()}]
            };
        }

        case "reset": {
            args.worldStore.reset({
                gridWidth: args.backendConfig.gridWidth,
                gridHeight: args.backendConfig.gridHeight
            });

            return {
                didChangeState: true,
                responseMessages: []
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
                responseMessages: []
            };
        }

        case "remove": {
            const didRemove: boolean = args.worldStore.remove({
                x: args.message.x,
                y: args.message.y
            });

            return {
                didChangeState: didRemove,
                responseMessages: []
            };
        }

        default: {
            return {
                didChangeState: false,
                responseMessages: [{type: "error", message: "Unknown message type"}]
            };
        }
    }
}