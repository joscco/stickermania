import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebSocket from "@fastify/websocket";
import {loadBackendConfig} from "./config.js";
import {SessionService} from "./session/sessionService.js";
import {FileSessionRepository} from "./infra/local/fileSessionRepository.js";
import {LocalAssetRepository} from "./infra/local/localAssetRepository.js";
import {registerApiRoutes} from "./http/apiRoutes.js";
import {registerWebSocket} from "./http/wsPlugin.js";

// ─── Bootstrap ──────────────────────────────────────────────────

const backendConfig = loadBackendConfig({argv: process.argv, cwd: process.cwd()});
const serverSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const sessionRepository = new FileSessionRepository(backendConfig.sessionsPath);
const assetRepository = new LocalAssetRepository(backendConfig.dataRoot);
const sessionService = new SessionService(backendConfig.gameConfig, sessionRepository, assetRepository);

// ─── Fastify instance ───────────────────────────────────────────

const app = Fastify({logger: false});

// ─── Plugins ────────────────────────────────────────────────────

// WebSocket support (must be registered before routes that use it)
await app.register(fastifyWebSocket);

// Serve user-generated assets (avatars, drawings) from data directory
const assetsRoot = path.resolve(backendConfig.dataRoot, "assets");
if (fs.existsSync(assetsRoot)) {
    await app.register(fastifyStatic, {
        root: assetsRoot,
        prefix: "/api/assets/",
        decorateReply: false,
    });
}

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

await registerApiRoutes(app, sessionService, backendConfig);
await registerWebSocket(app, sessionService, serverSessionId);

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

console.log(`[backend] Birthday Party Game Platform`);
console.log(`[backend] listening on port ${backendConfig.gameConfig.port}`);
console.log(`[backend] sessions stored in: ${backendConfig.sessionsPath}`);
console.log(`[backend] assets stored in: ${backendConfig.assetsPath}`);
console.log(`[backend] serving static frontend from ${frontendDist}`);
console.log(`\nOpen board to create a session:\n  http://${mdnsHost}:${backendConfig.gameConfig.port}/#/board`);
if (lanIps.length > 0) {
    console.log(`\nOpen (LAN IPv4):`);
    for (const ipAddress of lanIps) {
        console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/#/board`);
        console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/#/player`);
    }
}
