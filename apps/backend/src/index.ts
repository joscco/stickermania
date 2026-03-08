import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import mime from "mime";
import {loadBackendConfig} from "./config.js";
import {SessionService} from "./session/sessionService.js";
import {FileSessionRepository} from "./infra/local/fileSessionRepository.js";
import {LocalAssetRepository} from "./infra/local/localAssetRepository.js";
import {serveStatic} from "./http/static.js";
import {createWebSocketHandler, disconnectSessionClients} from "./http/ws.js";

const backendConfig = loadBackendConfig({argv: process.argv, cwd: process.cwd()});
const serverSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const sessionRepository = new FileSessionRepository(backendConfig.sessionsPath);
const assetRepository = new LocalAssetRepository(backendConfig.dataRoot);
const sessionService = new SessionService(backendConfig.gameConfig, sessionRepository, assetRepository);

function buildBaseUrl(request: http.IncomingMessage): string {
    return `${request.headers["x-forwarded-proto"] ?? "http"}://${request.headers.host ?? `localhost:${backendConfig.gameConfig.port}`}`;
}

function resolveFrontendDistPath(): string {
    const withoutBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend");
    const withBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend/browser");
    if (fs.existsSync(path.resolve(withoutBrowser, "index.html"))) {
        return withoutBrowser;
    }
    if (fs.existsSync(path.resolve(withBrowser, "index.html"))) {
        return withBrowser;
    }
    return withoutBrowser;
}

function serveAsset(response: http.ServerResponse, assetRelativePath: string): void {
    const filePath = path.resolve(backendConfig.dataRoot, "assets", assetRelativePath);
    const expectedPrefix = path.resolve(backendConfig.dataRoot, "assets");
    if (!filePath.startsWith(expectedPrefix)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
    }
    try {
        const content = fs.readFileSync(filePath);
        response.writeHead(200, {"Content-Type": mime.getType(filePath) ?? "application/octet-stream"});
        response.end(content);
    } catch {
        response.writeHead(404);
        response.end("Not found");
    }
}

const JSON_HEADER = {"Content-Type": "application/json; charset=utf-8"};

function readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown> | null> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        request.on("data", (chunk: Buffer) => chunks.push(chunk));
        request.on("end", () => {
            try {
                const raw = Buffer.concat(chunks).toString("utf-8");
                const parsed = raw.length > 0 ? JSON.parse(raw) : null;
                resolve(typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null);
            } catch {
                resolve(null);
            }
        });
        request.on("error", () => resolve(null));
    });
}

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? "/", buildBaseUrl(request));

    if (requestUrl.pathname === "/api/sessions" && request.method === "GET") {
        const sessions = await sessionService.listSessions();
        const summaries = sessions.map((s) => ({
            sessionId: s.sessionId,
            sessionCode: s.sessionCode,
            activeMode: s.activeMode,
            playerCount: Object.keys(s.players).length,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
        }));
        response.writeHead(200, JSON_HEADER);
        response.end(JSON.stringify(summaries));
        return;
    }

    if (requestUrl.pathname === "/api/sessions" && request.method === "POST") {
        const body = await readJsonBody(request);
        const mode = (typeof body?.mode === "string" && ["draw-search", "garden-coop", "team-graffiti"].includes(body.mode))
            ? body.mode as "draw-search" | "garden-coop" | "team-graffiti"
            : "draw-search";
        const createdSession = await sessionService.createSession({baseUrl: buildBaseUrl(request), initialMode: mode});
        response.writeHead(201, JSON_HEADER);
        response.end(JSON.stringify(createdSession));
        return;
    }

    if (requestUrl.pathname.startsWith("/api/assets/") && request.method === "GET") {
        serveAsset(response, requestUrl.pathname.replace(/^\/api\/assets\//u, ""));
        return;
    }

    const byCodeMatch = requestUrl.pathname.match(/^\/api\/sessions\/by-code\/([^/]+)$/u);
    if (byCodeMatch && request.method === "GET") {
        const sessionCode = decodeURIComponent(byCodeMatch[1]).trim().toUpperCase();
        const state = await sessionService.loadStateByCode(sessionCode);

        if (!state) {
            response.writeHead(404, JSON_HEADER);
            response.end(JSON.stringify({message: "Session not found"}));
            return;
        }

        response.writeHead(200, JSON_HEADER);
        response.end(JSON.stringify({
            sessionId: state.sessionId,
            sessionCode: state.sessionCode,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt,
        }));
        return;
    }

    const stateMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/state$/u);
    if (stateMatch && request.method === "GET") {
        const state = await sessionService.loadState(stateMatch[1]);
        if (!state) {
            response.writeHead(404, JSON_HEADER);
            response.end(JSON.stringify({message: "Session not found"}));
            return;
        }
        const sinceRevision = Number(requestUrl.searchParams.get("sinceRevision") ?? -1);
        if (Number.isFinite(sinceRevision) && sinceRevision >= 0 && sinceRevision === state.revision) {
            response.writeHead(204);
            response.end();
            return;
        }
        response.writeHead(200, JSON_HEADER);
        response.end(JSON.stringify(state));
        return;
    }

    const resetMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/reset$/u);
    if (resetMatch && request.method === "POST") {
        const state = await sessionService.resetSession(resetMatch[1]);
        if (!state) {
            response.writeHead(404, JSON_HEADER);
            response.end(JSON.stringify({message: "Session not found"}));
            return;
        }
        response.writeHead(200, JSON_HEADER);
        response.end(JSON.stringify({ok: true}));
        return;
    }

    const deleteMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)$/u);
    if (deleteMatch && request.method === "DELETE") {
        const deletedSessionId = deleteMatch[1];
        const deleted = await sessionService.deleteSession(deletedSessionId);
        if (!deleted) {
            response.writeHead(404, JSON_HEADER);
            response.end(JSON.stringify({message: "Session not found"}));
            return;
        }
        disconnectSessionClients(deletedSessionId);
        response.writeHead(200, JSON_HEADER);
        response.end(JSON.stringify({ok: true}));
        return;
    }

    if (requestUrl.pathname === "/api/info" && request.method === "GET") {
        response.writeHead(200, JSON_HEADER);
        response.end(JSON.stringify({baseUrl: buildBaseUrl(request)}));
        return;
    }

    if (requestUrl.pathname === "/api/wlan-config" && request.method === "GET") {
        if (backendConfig.wlanConfig) {
            response.writeHead(200, JSON_HEADER);
            response.end(JSON.stringify(backendConfig.wlanConfig));
        } else {
            response.writeHead(404, JSON_HEADER);
            response.end(JSON.stringify({message: "WLAN config not available"}));
        }
        return;
    }

    serveStatic({request, response, distRootAbsolutePath: resolveFrontendDistPath()});

});

createWebSocketHandler(server, sessionService, serverSessionId);

server.listen(backendConfig.gameConfig.port, "0.0.0.0", () => {
    const mdnsHost = `${os.hostname()}.local`;
    const lanIps: string[] = [];
    for (const [, entries] of Object.entries(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === "IPv4" && !entry.internal) {
                lanIps.push(entry.address);
            }
        }
    }

    console.log(`[backend] 🎨 Birthday Party Game Platform`);
    console.log(`[backend] listening on port ${backendConfig.gameConfig.port}`);
    console.log(`[backend] sessions stored in: ${backendConfig.sessionsPath}`);
    console.log(`[backend] assets stored in: ${backendConfig.assetsPath}`);
    console.log(`[backend] serving static frontend`);
    console.log(`\nOpen board to create a session:\n  http://${mdnsHost}:${backendConfig.gameConfig.port}/#/board`);
    if (lanIps.length > 0) {
        console.log(`\nOpen (LAN IPv4):`);
        for (const ipAddress of lanIps) {
            console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/#/board`);
            console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/#/player`);
        }
    }
});

