import type { WorldState } from "@birthday/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isWorldStateLike(value: unknown): value is WorldState {
    if (!isRecord(value)) {
        return false;
    }

    const maybeState = value as Record<string, unknown>;

    if (!isRecord(maybeState["placements"])) {
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

export function sanitizeWorldState(args: { candidate: unknown; fallback: WorldState }): WorldState {
    if (!isWorldStateLike(args.candidate)) {
        return args.fallback;
    }

    const maybeState = args.candidate as any;

    return {
        placements: maybeState.placements,
        revision: typeof maybeState.revision === "number" ? maybeState.revision : args.fallback.revision,
        updatedAt: typeof maybeState.updatedAt === "number" ? maybeState.updatedAt : Date.now()
    };
}