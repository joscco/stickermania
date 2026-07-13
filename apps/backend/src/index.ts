import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import {loadBackendConfig} from "./config.js";
import {SessionService} from "./features/session-management/sessionService.js";
import {FileSessionRepository} from "./infrastructure/local/fileSessionRepository.js";
import {LocalAssetRepository} from "./infrastructure/local/localAssetRepository.js";
import {registerApiRoutes} from "./http/apiRoutes.js";
import {registerAuthPlugin} from "./http/authPlugin.js";
import {registerDefaultStickerCatalogRoutes} from "./features/sticker-management/default-catalog/defaultStickerCatalogRoutes.js";
import {registerWebSocket} from "./http/wsPlugin.js";
import type {AssetRepository} from "./infrastructure/assetRepository.js";
import type {SessionRepository} from "./infrastructure/sessionRepository.js";

// ─── Bootstrap ──────────────────────────────────────────────────

const backendConfig = loadBackendConfig({argv: process.argv, cwd: process.cwd()});
const {devMode} = backendConfig;

const app = Fastify({logger: false, bodyLimit: 25 * 1024 * 1024, trustProxy: true});


// ─── Plugins ────────────────────────────────────────────────────

await app.register(fastifyCookie);


// WebSocket support (must be registered before routes that use it).
// Dev mode still needs game sessions for local multiplayer testing.
await app.register(fastifyWebSocket);

// Serve user-generated assets from local disk in LAN/local mode.
// In Cloud mode, /api/assets/* is registered by apiRoutes and streams from GCS.
if (backendConfig.assetStore === "local") {
    const assetsRoot = path.resolve(backendConfig.dataRoot, "assets");
    fs.mkdirSync(assetsRoot, {recursive: true}); // ensure it exists before registering
    await app.register(fastifyStatic, {
        root: assetsRoot,
        prefix: "/api/assets/",
        decorateReply: false,
        setHeaders: (res) => {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        },
    });
}

// Serve Angular frontend from dist directory
function resolveFrontendDistPath(): string {
    if (process.env.FRONTEND_DIST_PATH) {
        return path.resolve(process.env.FRONTEND_DIST_PATH);
    }
    const withoutBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend");
    const withBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend/browser");
    if (fs.existsSync(path.resolve(withBrowser, "index.html"))) {
        return withBrowser;
    }
    return withoutBrowser;
}

const frontendDist = resolveFrontendDistPath();
const serveBuiltFrontend = !devMode || process.env.SERVE_FRONTEND_IN_DEV === "true";
if (serveBuiltFrontend && fs.existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
        root: frontendDist,
        wildcard: false,
        setHeaders: (res, filePath) => {
            const fileName = path.basename(filePath);
            if (fileName === "index.html") {
                res.setHeader("Cache-Control", "no-store, max-age=0");
                return;
            }
            if (/\.[a-z0-9]{8,}\.(?:js|css|mjs|woff2?|png|jpg|jpeg|webp|svg)$/i.test(fileName)) {
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            }
        },
    });
}

// ─── Routes ─────────────────────────────────────────────────────

// Default sticker catalog routes are available in all modes (party + dev)
await registerDefaultStickerCatalogRoutes(app, backendConfig);
// Auth routes available in all modes
await registerAuthPlugin(app, backendConfig);

// Game routes + WebSocket are also active in dev mode. The dev frontend uses
// them through the Angular proxy, and the built frontend uses them directly.
const serverSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const sessionRepository: SessionRepository = backendConfig.sessionStore === "firestore"
    ? new (await import("./infrastructure/cloud/firestoreSessionRepository.js")).FirestoreSessionRepository({
        projectId: backendConfig.gcpProjectId,
        collectionName: backendConfig.firestoreCollection,
    })
    : new FileSessionRepository(backendConfig.sessionsPath);
const assetRepository: AssetRepository = backendConfig.assetStore === "gcs"
    ? new (await import("./infrastructure/cloud/cloudStorageAssetRepository.js")).CloudStorageAssetRepository({
        projectId: backendConfig.gcpProjectId,
        bucketName: backendConfig.cloudAssetBucket ?? (() => {
            throw new Error("ASSET_STORE=gcs requires CLOUD_ASSET_BUCKET.");
        })(),
    })
    : new LocalAssetRepository(backendConfig.dataRoot);
const sessionService = new SessionService(backendConfig.gameConfig, sessionRepository, assetRepository);

await registerApiRoutes(app, sessionService, backendConfig, assetRepository);
await registerWebSocket(app, sessionService, serverSessionId);

// SPA fallback: serve index.html for non-API, non-asset routes
app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
        return reply.status(404).send({message: "Not found"});
    }
    if (devMode && !serveBuiltFrontend) {
        return reply
            .header("Cache-Control", "no-store, max-age=0")
            .type("text/plain")
            .send("DEV backend läuft. Öffne die DEV-Oberfläche über http://localhost:4200/.");
    }
    const indexPath = path.resolve(frontendDist, "index.html");
    if (fs.existsSync(indexPath)) {
        return reply
            .header("Cache-Control", "no-store, max-age=0")
            .type("text/html")
            .send(fs.readFileSync(indexPath));
    }
    return reply.status(404).send("Frontend not built");
});

// ─── Start ──────────────────────────────────────────────────────

await app.listen({port: backendConfig.gameConfig.port, host: "0.0.0.0"});

const hostName = os.hostname();
const mdnsHost = hostName.includes(".") ? hostName : `${hostName}.local`;
const lanIps: string[] = [];
for (const [, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
        if (entry.family === "IPv4" && !entry.internal) {
            lanIps.push(entry.address);
        }
    }
}

const modeLabel = devMode ? "🛠️  DEV (Editors + Game API)" : "🎉 GAME";
console.log(`[backend] Birthday Party Game Platform — ${modeLabel}`);
console.log(`[backend] listening on port ${backendConfig.gameConfig.port}`);

if (devMode) {
    console.log(`\nDEV frontend available at:`);
    console.log(`  http://localhost:4200/`);
    console.log(`\nGame API/WebSocket available at:`);
    console.log(`  http://localhost:${backendConfig.gameConfig.port}/`);
    console.log(`[backend] sessions stored in: ${backendConfig.sessionsPath}`);
    console.log(`[backend] assets stored in: ${backendConfig.assetsPath}`);
} else {
    console.log(`[backend] session store: ${backendConfig.sessionStore}`);
    console.log(`[backend] asset store: ${backendConfig.assetStore}`);
    if (backendConfig.sessionStore === "file") {
        console.log(`[backend] sessions stored in: ${backendConfig.sessionsPath}`);
    }
    if (backendConfig.assetStore === "local") {
        console.log(`[backend] assets stored in: ${backendConfig.assetsPath}`);
    } else {
        console.log(`[backend] assets bucket: ${backendConfig.cloudAssetBucket}`);
    }
    console.log(`[backend] serving static frontend from ${frontendDist}`);
    console.log(`\nOpen in browser:\n  http://${mdnsHost}:${backendConfig.gameConfig.port}/`);
    if (lanIps.length > 0) {
        console.log(`\nOpen (LAN IPv4):`);
        for (const ipAddress of lanIps) {
            console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/`);
        }
    }
}
