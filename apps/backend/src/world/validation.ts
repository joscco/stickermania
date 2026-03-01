import type { GameState } from "@birthday/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGameStateLike(value: unknown): value is GameState {
    if (!isRecord(value)) {
        return false;
    }

    const maybeState = value as Record<string, unknown>;

    if (!isRecord(maybeState["players"])) {
        return false;
    }
    if (!isRecord(maybeState["drawings"])) {
        return false;
    }
    if (typeof maybeState["revision"] !== "number") {
        return false;
    }
    if (typeof maybeState["updatedAt"] !== "number") {
        return false;
    }

    return true;
}

export function sanitizeGameState(args: { candidate: unknown; fallback: GameState }): GameState {
    if (!isGameStateLike(args.candidate)) {
        return args.fallback;
    }

    const maybeState = args.candidate as any;

    return {
        players: maybeState.players ?? {},
        drawings: maybeState.drawings ?? {},
        round: maybeState.round ?? { phase: "LOBBY", endsAt: 0, drawDurationSec: 60, searchDurationSec: 90, roundNumber: 0 },
        revision: typeof maybeState.revision === "number" ? maybeState.revision : args.fallback.revision,
        updatedAt: typeof maybeState.updatedAt === "number" ? maybeState.updatedAt : Date.now()
    };
}