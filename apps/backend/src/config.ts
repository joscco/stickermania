import fs from "node:fs";
import path from "node:path";
import { parseGameConfig, type GameConfig } from "@birthday/shared";

export interface WlanConfig {
    wifi?: {
        ssid?: string;
        password?: string;
        security?: string;
        hidden?: boolean;
        showWifiSectionByDefault?: boolean;
    };
}

export interface BackendConfig {
    gameConfig: GameConfig;
    shouldServeStatic: boolean;
    dataRoot: string;
    sessionsPath: string;
    assetsPath: string;
    wlanConfig: WlanConfig | null;
}

export function loadBackendConfig(args: { argv: string[]; cwd: string }): BackendConfig {
    const configPath = path.resolve(args.cwd, "game.config.json");
    let rawConfig: unknown = {};
    try {
        rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        console.log(`[config] loaded game.config.json from ${configPath}`);
    } catch {
        console.warn(`[config] game.config.json not found at ${configPath}, using defaults`);
    }

    const gameConfig = parseGameConfig(rawConfig);
    if (process.env.PORT) {
        gameConfig.port = Number(process.env.PORT) || gameConfig.port;
    }
    if (process.env.ADMIN_PASSWORD) {
        gameConfig.adminPassword = process.env.ADMIN_PASSWORD;
    }

    // Load optional WLAN config from project root (party mode only)
    const wlanConfigPath = path.resolve(args.cwd, "wlan-config.json");
    let wlanConfig: WlanConfig | null = null;
    try {
        wlanConfig = JSON.parse(fs.readFileSync(wlanConfigPath, "utf-8")) as WlanConfig;
        console.log(`[config] loaded wlan-config.json from ${wlanConfigPath}`);
    } catch {
        console.log(`[config] wlan-config.json not found at ${wlanConfigPath} (OK for cloud mode)`);
    }

    const dataRoot = path.resolve(process.env.DATA_ROOT ?? path.resolve(args.cwd, ".data"));
    const sessionsPath = path.resolve(dataRoot, "sessions");
    const assetsPath = path.resolve(dataRoot, "assets");
    const shouldServeStatic = args.argv.includes("--serve-static");

    return { gameConfig, shouldServeStatic, dataRoot, sessionsPath, assetsPath, wlanConfig };
}
