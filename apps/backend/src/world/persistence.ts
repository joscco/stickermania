import fs from "node:fs";
import type { WorldState } from "@birthday/shared";
import { sanitizeWorldState } from "./validation.js";

export function loadWorldFromDisk(args: {
    persistPath: string;
    createEmptyWorld: () => WorldState;
}): WorldState {
    try {
        if (!fs.existsSync(args.persistPath)) {
            return args.createEmptyWorld();
        }

        const raw: string = fs.readFileSync(args.persistPath, "utf-8");
        const parsed: unknown = JSON.parse(raw);

        return sanitizeWorldState({ candidate: parsed, fallback: args.createEmptyWorld() });
    } catch {
        return args.createEmptyWorld();
    }
}

export function saveWorldToDisk(args: { persistPath: string; worldState: WorldState }): void {
    try {
        fs.writeFileSync(args.persistPath, JSON.stringify(args.worldState, null, 2), "utf-8");
    } catch {
        // party mode: ignore persistence issues
    }
}