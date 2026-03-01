import fs from "node:fs";
import type { GameState } from "@birthday/shared";
import { sanitizeGameState } from "./validation.js";

export function loadGameFromDisk(args: {
    persistPath: string;
    createEmpty: () => GameState;
}): GameState {
    try {
        if (!fs.existsSync(args.persistPath)) {
            return args.createEmpty();
        }

        const raw: string = fs.readFileSync(args.persistPath, "utf-8");
        const parsed: unknown = JSON.parse(raw);

        // Support both old format ({world:..., challenge:...}) and new ({game:...})
        const candidate = (parsed as any)?.game ?? parsed;

        return sanitizeGameState({ candidate, fallback: args.createEmpty() });
    } catch {
        return args.createEmpty();
    }
}

export function saveGameToDisk(args: { persistPath: string; state: GameState }): void {
    try {
        fs.writeFileSync(args.persistPath, JSON.stringify({ game: args.state }, null, 2), "utf-8");
    } catch {
        // party mode: ignore persistence issues
    }
}