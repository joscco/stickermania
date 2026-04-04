import type {FastifyInstance} from "fastify";
import type {GameModeId} from "@birthday/shared";
import type {SessionService} from "../session/sessionService.js";
import type {BackendConfig} from "../config.js";
import {disconnectSessionClients} from "./wsPlugin.js";

const VALID_MODES: GameModeId[] = ["sticker-collage"];

function buildBaseUrl(protocol: string, hostname: string, port: number): string {
    return `${protocol}://${hostname.includes(":") ? hostname : `${hostname}:${port}`}`;
}

export async function registerApiRoutes(
    app: FastifyInstance,
    sessionService: SessionService,
    backendConfig: BackendConfig,
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
        const state = await sessionService.resetSession(request.params.id);

        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }

        return {ok: true};
    });

    // ─── Delete session ─────────────────────────────────────────

    app.delete<{Params: {id: string}}>("/api/sessions/:id", async (request, reply) => {
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

    app.get("/api/wlan-config", async (_request, reply) => {
        if (backendConfig.wlanConfig) {
            return backendConfig.wlanConfig;
        }
        return reply.status(404).send({message: "WLAN config not available"});
    });
}

