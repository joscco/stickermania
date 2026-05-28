import fs from "node:fs";
import path from "node:path";
import { parseGameConfig, type GameConfig } from "@birthday/shared";
import {getMinigameTasks} from "../../minigames/registry.js";

export interface BackendConfig {
    devMode: boolean;
    gameConfig: GameConfig;
    dataRoot: string;
    sessionsPath: string;
    assetsPath: string;
}

export function loadBackendConfig(args: { argv: string[]; cwd: string }): BackendConfig {
    // 1. Load game config (gitignored, only adminPassword locally)
    const privateConfigPath = path.resolve(args.cwd, "game.config.json");
    let rawPrivate: Record<string, unknown> = {};
    try {
        rawPrivate = JSON.parse(fs.readFileSync(privateConfigPath, "utf-8"));
        console.log(`[config] loaded game.config.json (private)`);
    } catch {
        // Fine in Cloud — password comes from ADMIN_PASSWORD env var
    }

    // 2. Merge: public base, private overrides (private wins for any shared keys)
    const gameConfig = parseGameConfig(rawPrivate);

    // 3. Minigames provide their runnable task variants from their own folders.
    gameConfig.minigame = {tasks: getMinigameTasks()};
    console.log(`[config] loaded minigame variants (${gameConfig.minigame.tasks.length} tasks)`);

    // 5. Env-var overrides (highest priority)
    if (process.env.PORT) {
        gameConfig.port = Number(process.env.PORT) || gameConfig.port;
    }
    if (process.env.ADMIN_PASSWORD) {
        gameConfig.adminPassword = process.env.ADMIN_PASSWORD;
    }

    const dataRoot = path.resolve(process.env.DATA_ROOT ?? path.resolve(args.cwd, ".data"));
    const sessionsPath = path.resolve(dataRoot, "sessions");
    const assetsPath = path.resolve(dataRoot, "assets");

    const devMode = process.env.APP_MODE === "dev";

    return { devMode, gameConfig, dataRoot, sessionsPath, assetsPath };
}
