import type { GameState } from "@birthday/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isGameStateLike(value: unknown): value is GameState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isRecord(value["players"]) &&
    isRecord(value["drawings"]) &&
    typeof value["revision"] === "number" &&
    typeof value["updatedAt"] === "number"
  );
}

export function sanitizeGameState(args: { candidate: unknown; fallback: GameState }): GameState {
  if (!isGameStateLike(args.candidate)) {
    return args.fallback;
  }

  const raw = args.candidate as any;

  return {
    players: raw.players ?? {},
    drawings: raw.drawings ?? {},
    round: raw.round ?? { phase: "LOBBY", endsAt: 0, drawDurationSec: 60, searchDurationSec: 90, roundNumber: 0 },
    promptAssignments: raw.promptAssignments ?? {},
    effectiveFieldWidth: typeof raw.effectiveFieldWidth === "number" ? raw.effectiveFieldWidth : 1000,
    effectiveFieldHeight: typeof raw.effectiveFieldHeight === "number" ? raw.effectiveFieldHeight : 1000,
    revision: typeof raw.revision === "number" ? raw.revision : args.fallback.revision,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
}