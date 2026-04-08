import fs from "node:fs";
import path from "node:path";
import type {FastifyInstance} from "fastify";
import type {GameModeId, StickerCollageModeState} from "@birthday/shared";
import type {SessionService} from "../session/sessionService.js";
import type {BackendConfig} from "../config.js";
import type {AssetRepository} from "../infra/assetRepository.js";
import {disconnectSessionClients} from "./wsPlugin.js";
import {hasBoardAuth} from "./authPlugin.js";

const VALID_MODES: GameModeId[] = ["sticker-collage"];

function buildBaseUrl(protocol: string, hostname: string, port: number): string {
    return `${protocol}://${hostname.includes(":") ? hostname : `${hostname}:${port}`}`;
}

export async function registerApiRoutes(
    app: FastifyInstance,
    sessionService: SessionService,
    backendConfig: BackendConfig,
    assetRepository: AssetRepository,
): Promise<void> {

    // ─── Sessions CRUD ──────────────────────────────────────────

    app.get("/api/sessions", async () => {
        const sessions = await sessionService.listSessions();
        return sessions.map((s) => ({
            sessionId: s.sessionId,
            sessionCode: s.sessionCode,
            activeMode: s.activeMode,
            playerCount: Object.keys(s.players).length,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
        }));
    });

    app.post<{Body: {mode?: string}}>("/api/sessions", async (request, reply) => {
        if (!hasBoardAuth(request)) {
            return reply.status(401).send({message: "Nicht autorisiert."});
        }
        const mode = (typeof request.body?.mode === "string" && VALID_MODES.includes(request.body.mode as GameModeId))
            ? request.body.mode as GameModeId
            : "sticker-collage";

        const baseUrl = buildBaseUrl(request.protocol, request.hostname, backendConfig.gameConfig.port);
        const createdSession = await sessionService.createSession({baseUrl, initialMode: mode});
        return reply.status(201).send(createdSession);
    });

    // ─── Session by code ────────────────────────────────────────

    app.get<{Params: {code: string}}>("/api/sessions/by-code/:code", async (request, reply) => {
        const sessionCode = request.params.code.trim().toUpperCase();
        const state = await sessionService.loadStateByCode(sessionCode);

        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        return {
            sessionId: state.sessionId,
            sessionCode: state.sessionCode,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt,
        };
    });

    // ─── Session state ──────────────────────────────────────────

    app.get<{Params: {id: string}; Querystring: {sinceRevision?: string}}>("/api/sessions/:id/state", async (request, reply) => {
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

    // ─── Reset session ──────────────────────────────────────────

    app.post<{Params: {id: string}}>("/api/sessions/:id/reset", async (request, reply) => {
        if (!hasBoardAuth(request)) {
            return reply.status(401).send({message: "Nicht autorisiert."});
        }
        const state = await sessionService.resetSession(request.params.id);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }
        return {ok: true};
    });

    // ─── Delete session ─────────────────────────────────────────

    app.delete<{Params: {id: string}}>("/api/sessions/:id", async (request, reply) => {
        if (!hasBoardAuth(request)) {
            return reply.status(401).send({message: "Nicht autorisiert."});
        }
        const deletedSessionId = request.params.id;
        const deleted = await sessionService.deleteSession(deletedSessionId);
        if (!deleted) {
            return reply.status(404).send({message: "Session not found"});
        }
        disconnectSessionClients(deletedSessionId);
        return {ok: true};
    });

    // ─── Info / Config ──────────────────────────────────────────

    app.get("/api/info", async (request) => {
        const baseUrl = buildBaseUrl(request.protocol, request.hostname, backendConfig.gameConfig.port);
        return {baseUrl};
    });

    // ─── Session assets list ────────────────────────────────────

    app.get<{Params: {id: string}}>("/api/sessions/:id/assets", async (request, reply) => {
        const state = await sessionService.loadState(request.params.id);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        const sessionAssetsPath = path.resolve(backendConfig.dataRoot, "assets", request.params.id);
        const result: Array<{type: "avatar" | "collage"; filename: string; publicUrl: string}> = [];

        for (const subdir of ["avatars", "collages"] as const) {
            const dir = path.join(sessionAssetsPath, subdir);
            if (!fs.existsSync(dir)) continue;
            for (const filename of fs.readdirSync(dir)) {
                if (!filename.endsWith(".png")) continue;
                result.push({
                    type: subdir === "avatars" ? "avatar" : "collage",
                    filename,
                    publicUrl: `/api/assets/${request.params.id}/${subdir}/${filename}`,
                });
            }
        }

        return result;
    });

    // ─── Collage image upload ───────────────────────────────────

    app.post<{
        Params: {id: string};
        Body: {playerId: string; collageId: string; imageDataUrl: string};
    }>("/api/sessions/:id/collage-image", async (request, reply) => {
        const sessionId = request.params.id;
        const {playerId, collageId, imageDataUrl} = request.body ?? {};

        console.log(`[collage-image] POST for session=${sessionId}, player=${playerId}, collage=${collageId}, dataLen=${imageDataUrl?.length ?? 0}`);

        if (!playerId || !collageId || !imageDataUrl) {
            return reply.status(400).send({message: "Missing playerId, collageId, or imageDataUrl"});
        }

        const state = await sessionService.loadState(sessionId);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        const playerName = state.players[playerId]?.name ?? "anon";

        // Retrieve current round prompt from modeState
        const modeState = state.modeState as StickerCollageModeState | undefined;
        const prompt = modeState?.currentPrompt ?? "";

        // Save the image asset
        const saved = await assetRepository.saveCollage({
            sessionId, playerId, playerName, collageId, imageDataUrl, prompt,
        });

        // Update snapshotUrl on the matching collage in session state
        await sessionService.updateCollageSnapshot(sessionId, collageId, playerId, saved.publicUrl);

        return {ok: true, publicUrl: saved.publicUrl};
    });
}

