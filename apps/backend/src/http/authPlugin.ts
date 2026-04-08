import crypto from "node:crypto";
import type {FastifyInstance, FastifyRequest} from "fastify";
import type {BackendConfig} from "../config.js";

const COOKIE_NAME = "board_token";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days

// In-memory token store — sufficient with max-instances 1
const validTokens = new Set<string>();

function generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
}

/** Returns true if the request carries a valid board token cookie. */
export function hasBoardAuth(request: FastifyRequest): boolean {
    const token = (request.cookies as Record<string, string | undefined>)[COOKIE_NAME];
    return !!token && validTokens.has(token);
}

export async function registerAuthPlugin(
    app: FastifyInstance,
    backendConfig: BackendConfig,
): Promise<void> {
    // POST /api/auth/board-login
    app.post<{Body: {password?: string}}>("/api/auth/board-login", async (request, reply) => {
        const {adminPassword} = backendConfig.gameConfig;

        // If no password is configured, board login is always granted
        if (!adminPassword || request.body?.password === adminPassword) {
            const token = generateToken();
            validTokens.add(token);

            reply.setCookie(COOKIE_NAME, token, {
                httpOnly: true,
                sameSite: "strict",
                path: "/",
                maxAge: COOKIE_MAX_AGE_SEC,
                secure: !!process.env.PORT, // PORT is set by Cloud Run → HTTPS → secure cookie
            });

            return {ok: true};
        }

        return reply.status(401).send({message: "Falsches Passwort."});
    });

    // GET /api/auth/board-status
    app.get("/api/auth/board-status", async (request, reply) => {
        if (hasBoardAuth(request)) {
            return {authenticated: true};
        }
        return reply.status(401).send({authenticated: false});
    });
}

