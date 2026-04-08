import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import {loadBackendConfig} from "./config.js";
import {SessionService} from "./session/sessionService.js";
import {FileSessionRepository} from "./infra/local/fileSessionRepository.js";
import {LocalAssetRepository} from "./infra/local/localAssetRepository.js";
import {registerApiRoutes} from "./http/apiRoutes.js";
import {registerAuthPlugin} from "./http/authPlugin.js";
import {registerEditorApiRoutes} from "./http/editorApiRoutes.js";
import {registerWebSocket} from "./http/wsPlugin.js";

// ─── Bootstrap ──────────────────────────────────────────────────

const backendConfig = loadBackendConfig({argv: process.argv, cwd: process.cwd()});
const {devMode} = backendConfig;

const app = Fastify({logger: false, bodyLimit: 10 * 1024 * 1024}); // 10 MB for collage image uploads

// ─── Plugins ────────────────────────────────────────────────────

await app.register(fastifyCookie);

// WebSocket support (must be registered before routes that use it)
if (!devMode) {
    await app.register(fastifyWebSocket);
}

// Serve user-generated assets (avatars, drawings, collages) from data directory
const assetsRoot = path.resolve(backendConfig.dataRoot, "assets");
fs.mkdirSync(assetsRoot, {recursive: true}); // ensure it exists before registering
await app.register(fastifyStatic, {
    root: assetsRoot,
    prefix: "/api/assets/",
    decorateReply: false,
});

// Serve Angular frontend from dist directory
function resolveFrontendDistPath(): string {
    const withoutBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend");
    const withBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend/browser");
    if (fs.existsSync(path.resolve(withBrowser, "index.html"))) {
        return withBrowser;
    }
    return withoutBrowser;
}

const frontendDist = resolveFrontendDistPath();
if (fs.existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
        root: frontendDist,
        wildcard: false,
    });
}

// ─── Routes ─────────────────────────────────────────────────────

// Editor routes are available in all modes (party + dev)
await registerEditorApiRoutes(app, backendConfig);
// Auth routes available in all modes
await registerAuthPlugin(app, backendConfig);

if (!devMode) {
    // Game routes + WebSocket only in game mode
    const serverSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionRepository = new FileSessionRepository(backendConfig.sessionsPath);
    const assetRepository = new LocalAssetRepository(backendConfig.dataRoot);
    const sessionService = new SessionService(backendConfig.gameConfig, sessionRepository, assetRepository);

    await registerApiRoutes(app, sessionService, backendConfig, assetRepository);
    await registerWebSocket(app, sessionService, serverSessionId);
}

// SPA fallback: serve index.html for non-API, non-asset routes
app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/")) {
        return reply.status(404).send({message: "Not found"});
    }

    const indexPath = path.resolve(frontendDist, "index.html");
    if (fs.existsSync(indexPath)) {
        return reply.type("text/html").send(fs.readFileSync(indexPath));
    }

    return reply.status(404).send("Frontend not built");
});

// ─── Start ──────────────────────────────────────────────────────

await app.listen({port: backendConfig.gameConfig.port, host: "0.0.0.0"});

const mdnsHost = `${os.hostname()}.local`;
const lanIps: string[] = [];
for (const [, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
        if (entry.family === "IPv4" && !entry.internal) {
            lanIps.push(entry.address);
        }
    }
}

const modeLabel = devMode ? "🛠️  DEV (Editors only)" : "🎉 GAME";
console.log(`[backend] Birthday Party Game Platform — ${modeLabel}`);
console.log(`[backend] listening on port ${backendConfig.gameConfig.port}`);

if (devMode) {
    console.log(`\nEditors available at:`);
    console.log(`  http://localhost:${backendConfig.gameConfig.port}/#/editor`);
    console.log(`  http://localhost:${backendConfig.gameConfig.port}/#/hitbox-editor`);
} else {
    console.log(`[backend] sessions stored in: ${backendConfig.sessionsPath}`);
    console.log(`[backend] assets stored in: ${backendConfig.assetsPath}`);
    console.log(`[backend] serving static frontend from ${frontendDist}`);
    console.log(`\nOpen in browser:\n  http://${mdnsHost}:${backendConfig.gameConfig.port}/`);
    if (lanIps.length > 0) {
        console.log(`\nOpen (LAN IPv4):`);
        for (const ipAddress of lanIps) {
            console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/`);
        }
    }
}
