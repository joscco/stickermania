import type {FastifyInstance} from "fastify";
import os from "node:os";
import type {BackendConfig} from "../../config.js";
import type {AssetRepository} from "../../infrastructure/assetRepository.js";
import type {SessionService} from "./sessionService.js";
import {hasBoardAuth} from "../../http/authPlugin.js";
import {disconnectSessionClients} from "../../http/wsPlugin.js";
import type {SessionState, StickerAssetManifest} from "@stickermania/shared";

function buildBaseUrl(protocol: string, hostname: string, port: number): string {
    return `${protocol}://${hostname.includes(":") ? hostname : `${hostname}:${port}`}`;
}

function getLanIpv4Addresses(): string[] {
    const addresses: string[] = [];
    for (const [, entries] of Object.entries(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === "IPv4" && !entry.internal) {
                addresses.push(entry.address);
            }
        }
    }
    return addresses;
}

function uniqueUrls(urls: string[]): string[] {
    return [...new Set(urls)];
}

function isLoopbackUrl(rawUrl: string): boolean {
    try {
        const hostname = new URL(rawUrl).hostname.toLowerCase();
        return hostname === "localhost" || hostname === "::1" || hostname.startsWith("127.");
    } catch {
        return true;
    }
}

function resolveMdnsHost(): string {
    const hostName = os.hostname();
    return hostName.includes(".") ? hostName : `${hostName}.local`;
}

export async function registerSessionManagementApiRoutes(
    app: FastifyInstance,
    sessionService: SessionService,
    backendConfig: BackendConfig,
    assetRepository: AssetRepository,
): Promise<void> {
    app.get("/api/sessions", async () => {
        const sessions = await sessionService.listSessions();
        return sessions.map(session => ({
            sessionId: session.sessionId,
            sessionCode: session.sessionCode,
            playerCount: Object.keys(session.players).length,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
        }));
    });

    app.post("/api/sessions", async (request, reply) => {
        if (!hasBoardAuth(request)) {
            return reply.status(401).send({message: "Nicht autorisiert."});
        }

        const baseUrl = buildBaseUrl(request.protocol, request.hostname, backendConfig.gameConfig.port);
        const createdSession = await sessionService.createSession({baseUrl});
        return reply.status(201).send(createdSession);
    });

    app.post("/api/host-game", async (request, reply) => {
        if (backendConfig.sessionStore !== "file" || backendConfig.assetStore !== "local") {
            return reply.status(404).send({message: "Host game is only available in LAN host mode."});
        }

        const baseUrl = buildBaseUrl(request.protocol, request.hostname, backendConfig.gameConfig.port);
        const hostSession = await sessionService.getOrCreateHostSession({baseUrl});
        return reply.status(200).send(hostSession);
    });

    app.get<{ Params: { code: string } }>("/api/sessions/by-code/:code", async (request, reply) => {
        const sessionCode = request.params.code.trim().toUpperCase();
        const state = await sessionService.loadStateByCode(sessionCode);

        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        return {
            sessionId: state.sessionId,
            sessionCode: state.sessionCode,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt
        };
    });

    app.get<{
        Params: { id: string };
        Querystring: { sinceRevision?: string }
    }>("/api/sessions/:id/state", async (request, reply) => {
        const state = await sessionService.loadState(request.params.id);

        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        const sinceRevision = Number(request.query.sinceRevision ?? -1);
        if (Number.isFinite(sinceRevision) && sinceRevision >= 0 && sinceRevision === state.revision) {
            return reply.status(204).send();
        }

        return state;
    });

    app.post<{ Params: { id: string } }>("/api/sessions/:id/reset", async (request, reply) => {
        if (!hasBoardAuth(request)) {
            return reply.status(401).send({message: "Nicht autorisiert."});
        }

        const state = await sessionService.resetSession(request.params.id);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        return {ok: true};
    });

    app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (request, reply) => {
        if (!hasBoardAuth(request)) {
            return reply.status(401).send({message: "Nicht autorisiert."});
        }

        const deleted = await sessionService.deleteSession(request.params.id);
        if (!deleted) {
            return reply.status(404).send({message: "Session not found"});
        }

        disconnectSessionClients(request.params.id);
        return {ok: true};
    });

    app.get("/api/info", async (request) => {
        const baseUrl = buildBaseUrl(request.protocol, request.hostname, backendConfig.gameConfig.port);
        const port = backendConfig.gameConfig.port;
        const mdnsUrl = `${request.protocol}://${resolveMdnsHost()}:${port}`;
        const lanUrls = getLanIpv4Addresses().map(address => `${request.protocol}://${address}:${port}`);
        const mode = backendConfig.sessionStore === "firestore" || backendConfig.assetStore === "gcs"
            ? "cloud"
            : backendConfig.devMode ? "dev" : "lan-host";
        const publicBaseUrls = uniqueUrls([...lanUrls, mdnsUrl, baseUrl])
            .filter(url => mode !== "lan-host" || !isLoopbackUrl(url));

        return {
            mode,
            baseUrl,
            port,
            mdnsUrl,
            lanUrls,
            playerJoinUrls: publicBaseUrls.map(url => `${url}/?view=player`),
            boardUrls: publicBaseUrls.map(url => `${url}/?view=board`),
        };
    });

    app.get<{ Params: { id: string } }>("/api/sessions/:id/assets", async (request, reply) => {
        const state = await sessionService.loadState(request.params.id);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        return assetRepository.listSessionAssets(request.params.id);
    });

    app.get<{ Params: { id: string } }>("/api/sessions/:id/sticker-manifest", async (request, reply) => {
        const state = await sessionService.loadState(request.params.id);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        return buildStickerAssetManifest(state);
    });

    if (backendConfig.assetStore === "gcs") {
        app.get<{ Params: { "*": string } }>("/api/assets/*", async (request, reply) => {
            const asset = await assetRepository.readAsset(request.params["*"]);
            if (!asset) {
                return reply.status(404).send({message: "Asset not found"});
            }

            return reply
                .header("Cache-Control", "public, max-age=31536000, immutable")
                .type(asset.contentType)
                .send(asset.stream);
        });
    }
}

function buildStickerAssetManifest(state: SessionState): StickerAssetManifest {
    const stickersById = new Map<string, StickerAssetManifest["stickers"][number]>();
    for (const sticker of state.gameState.stickerCatalog) {
        if (!sticker.imageUrl || stickersById.has(sticker.id)) continue;
        stickersById.set(sticker.id, {
            id: sticker.id,
            imageUrl: sticker.imageUrl,
            kind: sticker.ownerPlayerId ? "player" as const : "default" as const,
            ...(sticker.ownerPlayerId ? {ownerPlayerId: sticker.ownerPlayerId} : {}),
            ...(sticker.createdAt ? {createdAt: sticker.createdAt} : {}),
        });
    }
    for (const playerStickers of Object.values(state.gameState.playerStickers ?? {})) {
        for (const sticker of playerStickers) {
            if (!sticker.imageUrl || stickersById.has(sticker.id)) continue;
            stickersById.set(sticker.id, {
                id: sticker.id,
                imageUrl: sticker.imageUrl,
                kind: "player",
                ownerPlayerId: sticker.ownerPlayerId,
                createdAt: sticker.createdAt,
            });
        }
    }

    return {
        sessionId: state.sessionId,
        revision: state.revision,
        stickers: [...stickersById.values()],
    };
}
