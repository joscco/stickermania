import fs from "node:fs";
import path from "node:path";
import { parseGameConfig, type GameConfig } from "@birthday/shared";

export interface BackendConfig {
    gameConfig: GameConfig;
    persistPath: string;
    shouldServeStatic: boolean;
}

export function loadBackendConfig(args: { argv: string[]; cwd: string }): BackendConfig {
    // Load central game config
    const configPath = path.resolve(args.cwd, "game.config.json");
    let rawConfig: unknown = {};
    try {
        const text = fs.readFileSync(configPath, "utf-8");
        rawConfig = JSON.parse(text);
        console.log(`[config] loaded game.config.json from ${configPath}`);
    } catch {
        console.warn(`[config] game.config.json not found at ${configPath}, using defaults`);
    }
    const gameConfig = parseGameConfig(rawConfig);

    // Env overrides
    if (process.env.PORT) gameConfig.port = Number(process.env.PORT) || gameConfig.port;
    if (process.env.ADMIN_PASSWORD) gameConfig.adminPassword = process.env.ADMIN_PASSWORD;

    const persistPath: string = process.env.PERSIST_PATH ?? `${args.cwd}/world-state.json`;
    const shouldServeStatic: boolean = args.argv.includes("--serve-static");

    return { gameConfig, persistPath, shouldServeStatic };
}