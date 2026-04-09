import fs from "node:fs";
import path from "node:path";
import { parseGameConfig, type GameConfig } from "@birthday/shared";

export interface BackendConfig {
    devMode: boolean;
    gameConfig: GameConfig;
    dataRoot: string;
    sessionsPath: string;
    assetsPath: string;
}

export function loadBackendConfig(args: { argv: string[]; cwd: string }): BackendConfig {
    // 1. Load public config (committed, all game settings, no secrets)
    const publicConfigPath = path.resolve(args.cwd, "game.config.public.json");
    let rawPublic: Record<string, unknown> = {};
    try {
        rawPublic = JSON.parse(fs.readFileSync(publicConfigPath, "utf-8"));
        console.log(`[config] loaded game.config.public.json`);
    } catch {
        console.warn(`[config] game.config.public.json not found at ${publicConfigPath}, using defaults`);
    }

    // 2. Load private config (gitignored, only adminPassword locally)
    const privateConfigPath = path.resolve(args.cwd, "game.config.json");
    let rawPrivate: Record<string, unknown> = {};
    try {
        rawPrivate = JSON.parse(fs.readFileSync(privateConfigPath, "utf-8"));
        console.log(`[config] loaded game.config.json (private)`);
    } catch {
        // Fine in Cloud — password comes from ADMIN_PASSWORD env var
    }

    // 3. Merge: public base, private overrides (private wins for any shared keys)
    const merged = { ...rawPublic, ...rawPrivate };
    const gameConfig = parseGameConfig(merged);

    // 4. Env-var overrides (highest priority)
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
