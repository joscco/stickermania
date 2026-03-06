export interface PlayerRuntimeSession {
  playerId: string;
  clientId: string;
  kind: "player" | "board";
  currentDrawPrompt: string | null;
  currentSearchDrawingId: string | null;
  usedDrawPrompts: Set<string>;
  usedSearchIds: Set<string>;
  lastTaskMode: "DRAW" | "SEARCH" | null;
  drawCountThisRound: number;
}
