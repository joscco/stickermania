import path from "node:path";
import type {GameConfig} from "@birthday/shared";
import {createGameConfig} from "@birthday/shared/stickermaniaConfig";

export interface BackendConfig {
    devMode: boolean;
    gameConfig: GameConfig;
    dataRoot: string;
    sessionsPath: string;
    assetsPath: string;
    sessionStore: "file" | "firestore";
    assetStore: "local" | "gcs";
    gcpProjectId: string | null;
    firestoreCollection: string;
    cloudAssetBucket: string | null;
}

export function loadBackendConfig(args: { argv: string[]; cwd: string }): BackendConfig {
    void args.argv;
    const gameConfig = createGameConfig(process.env);
    const dataRoot = path.resolve(process.env.DATA_ROOT ?? path.resolve(args.cwd, ".data"));
    const sessionsPath = path.resolve(dataRoot, "sessions");
    const assetsPath = path.resolve(dataRoot, "assets");
    const sessionStore = process.env.SESSION_STORE === "firestore" ? "firestore" : "file";
    const assetStore = process.env.ASSET_STORE === "gcs" ? "gcs" : "local";
    const gcpProjectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || null;
    const firestoreCollection = process.env.FIRESTORE_COLLECTION || "sessions";
    const cloudAssetBucket = process.env.CLOUD_ASSET_BUCKET || null;

    const devMode = process.env.APP_MODE === "dev";

    return {
        devMode,
        gameConfig,
        dataRoot,
        sessionsPath,
        assetsPath,
        sessionStore,
        assetStore,
        gcpProjectId,
        firestoreCollection,
        cloudAssetBucket,
    };
}
