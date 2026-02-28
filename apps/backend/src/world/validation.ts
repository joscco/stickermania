import type { WorldState } from "@birthday/shared";

export function isWorldStateLike(value: unknown): value is WorldState {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const maybeState: any = value;

    if (typeof maybeState.width !== "number") {
        return false;
    }
    if (typeof maybeState.height !== "number") {
        return false;
    }
    if (typeof maybeState.cells !== "object" || maybeState.cells === null) {
        return false;
    }

    return true;
}

export function sanitizeWorldState(args: { candidate: unknown; fallback: WorldState }): WorldState {
    if (!isWorldStateLike(args.candidate)) {
        return args.fallback;
    }

    const maybeState: any = args.candidate;

    return {
        width: maybeState.width,
        height: maybeState.height,
        cells: maybeState.cells,
        revision: typeof maybeState.revision === "number" ? maybeState.revision : args.fallback.revision,
        updatedAt: typeof maybeState.updatedAt === "number" ? maybeState.updatedAt : Date.now()
    };
}