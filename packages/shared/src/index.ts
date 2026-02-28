export type ObjectType =
  | "tree"
  | "flower"
  | "rock"
  | "bench"
  | "pond"
  | "gnome"
  | "lamp"
  | "bush";

export const OBJECT_TYPES: Array<{ type: ObjectType; label: string; emoji: string }> = [
  { type: "tree",   label: "Baum",        emoji: "🌳" },
  { type: "flower", label: "Blume",       emoji: "🌸" },
  { type: "rock",   label: "Stein",       emoji: "🪨" },
  { type: "bench",  label: "Bank",        emoji: "🪑" },
  { type: "pond",   label: "Teich",       emoji: "🟦" },
  { type: "gnome",  label: "Gartenzwerg", emoji: "🧙‍♂️" },
  { type: "lamp",   label: "Lampe",       emoji: "💡" },
  { type: "bush",   label: "Busch",       emoji: "🌿" }
];

export type CellKey = `${number},${number}`;

export interface PlacedObject {
  id: string;
  type: ObjectType;
  level: number; // reserved for later
  placedAt: number; // epoch ms
}

export interface WorldState {
  width: number;
  height: number;
  // sparse grid: only cells with objects exist in the map
  cells: Record<CellKey, PlacedObject>;
  revision: number;
  updatedAt: number;
}

export type ClientKind = "player" | "board";

export type ClientToServerMessage =
  | { type: "join"; kind: ClientKind; adminKey?: string }
  | { type: "place"; x: number; y: number; objectType: ObjectType }
  | { type: "remove"; x: number; y: number }
  | { type: "reset" }
  | { type: "ping"; t: number };

export type ServerToClientMessage =
    | { type: "welcome"; clientId: string; serverTime: number }
    | { type: "state"; state: WorldState }
    | { type: "error"; message: string }
    | { type: "pong"; t: number; serverTime: number }
    | { type: "event"; text: string; createdAt: number };

export function toCellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const roundedValue = Math.floor(value);
  if (roundedValue < min) {
    return min;
  }
  if (roundedValue > max) {
    return max;
  }
  return roundedValue;
}
