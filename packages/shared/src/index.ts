// Shared types for the birthday party platform with multiple game modes

// ─── Config types ────────────────────────────────────────────────

export interface DrawSearchGameConfig {
  drawPrompts: string[];
  drawDurationSec: number;
  searchDurationSec: number;
  maxDrawingsPerRound: number;
  searchOverscroll: number;
  canvasResolution: number;
  imageSizePx: number;
  fieldBaseSize: number;
  fieldGrowthPerDrawing: number;
  fieldMaxSize: number;
  minDrawingsForSearch: number;
  /** If > 0, inject this many test drawings on startMode (for dev/testing) */
  seedTestDrawings: number;
}

export interface GardenCoopGameConfig {
  plotCount: number;
  initialSeeds: number;
  pestChance: number;
}

export interface TeamGraffitiGameConfig {
  roundDurationSec: number;
  tagCooldownSec: number;
  wipeThreshold: number;
}

export interface GameConfig {
  // General
  playerColors: string[];
  colorsPerPlayer: number;
  drawingsPath: string;
  port: number;
  adminPassword: string | null;
  sessionTtlHours: number;
  // Per-mode
  drawSearch: DrawSearchGameConfig;
  gardenCoop: GardenCoopGameConfig;
  teamGraffiti: TeamGraffitiGameConfig;
}

function parseSubObject(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const sub = raw[key];
  return typeof sub === "object" && sub !== null ? sub as Record<string, unknown> : {};
}

export function parseGameConfig(raw: unknown): GameConfig {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  // Support flat legacy configs by also reading top-level keys
  const ds = parseSubObject(r, "drawSearch");
  const gc = parseSubObject(r, "gardenCoop");
  const tg = parseSubObject(r, "teamGraffiti");

  return {
    playerColors: Array.isArray(r["playerColors"]) ? (r["playerColors"] as string[]) : ["#dc2626", "#2563eb"],
    colorsPerPlayer: typeof r["colorsPerPlayer"] === "number" ? r["colorsPerPlayer"] : 2,
    drawingsPath: typeof r["drawingsPath"] === "string" ? r["drawingsPath"] : "./drawings",
    port: typeof r["port"] === "number" ? r["port"] : 3001,
    adminPassword: typeof r["adminPassword"] === "string" ? r["adminPassword"] : null,
    sessionTtlHours: typeof r["sessionTtlHours"] === "number" ? r["sessionTtlHours"] : 24,
    drawSearch: {
      drawPrompts: Array.isArray(ds["drawPrompts"] ?? r["drawPrompts"]) ? (ds["drawPrompts"] ?? r["drawPrompts"]) as string[] : ["Katze", "Hund", "Sonne"],
      drawDurationSec: typeof (ds["drawDurationSec"] ?? r["drawDurationSec"]) === "number" ? (ds["drawDurationSec"] ?? r["drawDurationSec"]) as number : 60,
      searchDurationSec: typeof (ds["searchDurationSec"] ?? r["searchDurationSec"]) === "number" ? (ds["searchDurationSec"] ?? r["searchDurationSec"]) as number : 90,
      maxDrawingsPerRound: typeof (ds["maxDrawingsPerRound"] ?? r["maxDrawingsPerRound"]) === "number" ? (ds["maxDrawingsPerRound"] ?? r["maxDrawingsPerRound"]) as number : 100,
      searchOverscroll: typeof (ds["searchOverscroll"] ?? r["searchOverscroll"]) === "number" ? (ds["searchOverscroll"] ?? r["searchOverscroll"]) as number : 0.15,
      canvasResolution: typeof (ds["canvasResolution"] ?? r["canvasResolution"]) === "number" ? (ds["canvasResolution"] ?? r["canvasResolution"]) as number : 400,
      imageSizePx: typeof (ds["imageSizePx"] ?? r["imageSizePx"]) === "number" ? (ds["imageSizePx"] ?? r["imageSizePx"]) as number : 200,
      fieldBaseSize: typeof (ds["fieldBaseSize"] ?? r["fieldBaseSize"]) === "number" ? (ds["fieldBaseSize"] ?? r["fieldBaseSize"]) as number : 800,
      fieldGrowthPerDrawing: typeof (ds["fieldGrowthPerDrawing"] ?? r["fieldGrowthPerDrawing"]) === "number" ? (ds["fieldGrowthPerDrawing"] ?? r["fieldGrowthPerDrawing"]) as number : 200,
      fieldMaxSize: typeof (ds["fieldMaxSize"] ?? r["fieldMaxSize"]) === "number" ? (ds["fieldMaxSize"] ?? r["fieldMaxSize"]) as number : 6000,
      minDrawingsForSearch: typeof ds["minDrawingsForSearch"] === "number" ? ds["minDrawingsForSearch"] : 3,
      seedTestDrawings: typeof ds["seedTestDrawings"] === "number" ? ds["seedTestDrawings"] : 0,
    },
    gardenCoop: {
      plotCount: typeof gc["plotCount"] === "number" ? gc["plotCount"] : 6,
      initialSeeds: typeof gc["initialSeeds"] === "number" ? gc["initialSeeds"] : 3,
      pestChance: typeof gc["pestChance"] === "number" ? gc["pestChance"] : 0.15,
    },
    teamGraffiti: {
      roundDurationSec: typeof tg["roundDurationSec"] === "number" ? tg["roundDurationSec"] : 120,
      tagCooldownSec: typeof tg["tagCooldownSec"] === "number" ? tg["tagCooldownSec"] : 5,
      wipeThreshold: typeof tg["wipeThreshold"] === "number" ? tg["wipeThreshold"] : 100,
    },
  };
}

export type ClientKind = "player" | "board";

export type GameModeId = "draw-search" | "garden-coop" | "team-graffiti";

export interface SessionPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarAssetPath: string | null;
  score: number;
  joinedAt: number;
  connected: boolean;
  isHost: boolean;
  teamId: string | null;
}

export interface SessionState<TModeState = UnknownModeState> {
  sessionId: string;
  sessionCode: string;
  players: Record<string, SessionPlayer>;
  activeMode: GameModeId;
  modeState: TModeState;
  revision: number;
  updatedAt: number;
  createdAt: number;
  expiresAt: number;
}

export type UnknownModeState = object;

export interface SessionInfo {
  sessionId: string;
  sessionCode: string;
  playerJoinUrl: string;
  boardUrl: string;
  createdAt: number;
  expiresAt: number;
}

export interface GameSession {
  id: string;
  code: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  revision: number;
  activeMode: GameModeId;
}

export type SessionClientToServerMessage =
    | { type: "join"; kind: ClientKind; sessionId: string; playerId?: string }
    | { type: "set-name"; name: string }
    | { type: "submit-avatar"; avatarDataUrl: string }
    | { type: "select-mode"; mode: GameModeId }
    | { type: "start-mode" }
    | { type: "reset-session" }
    | { type: "ping"; t: number };

export type SessionServerToClientMessage =
    | {
  type: "welcome";
  clientId: string;
  playerId: string;
  sessionId: string;
  serverTime: number;
  serverSessionId: string;
  assignedColors: string[];
}
    | { type: "session-state"; state: SessionState }
    | { type: "session-event"; text: string; createdAt: number }
    | { type: "error"; message: string }
    | { type: "pong"; t: number; serverTime: number };

/** Global game phase (not per-player). */
export type DrawSearchGamePhase = "LOBBY" | "ACTIVE" | "PAUSED";

/** What an individual player is currently doing. */
export type DrawSearchPlayerPhase = "DRAW" | "SEARCH" | "IDLE";

/** Legacy aliases kept for narrower compatibility; prefer the new names. */
export type DrawSearchRoundPhase = DrawSearchGamePhase;
export type DrawSearchPlayerMode = "LOBBY" | "DRAW" | "SEARCH" | "IDLE";

export interface DrawSearchMuseumSlot {
  id: string;
  x: number;
  y: number;
  rotationDeg: number;
}

export interface DrawSearchDrawing {
  id: string;
  artistId: string;
  prompt: string;
  imageUrl: string;
  imageAssetPath: string;
  x: number;
  y: number;
  slotId: string | null;
  placedAt: number;
  foundBy: string | null;
  foundAt: number | null;
}

/**
 * Kept for shape-compatibility but semantics changed:
 * - `phase` is now a DrawSearchGamePhase (LOBBY | ACTIVE | PAUSED)
 * - `endsAt` is always 0 (no global timer)
 * - `roundNumber` tracks how many cycles have happened globally (informational)
 */
export interface DrawSearchRoundState {
  phase: DrawSearchGamePhase;
  endsAt: number;
  drawDurationSec: number;
  searchDurationSec: number;
  roundNumber: number;
}

export interface DrawSearchPlayerPromptAssignment {
  playerPhase: DrawSearchPlayerPhase;
  cycleIndex: number;
  drawPrompts: string[];
  drawPromptIndex: number;
  activeDrawPrompt: string | null;
  searchTasks: Array<{ drawingId: string; prompt: string; artistName: string }>;
  searchTaskIndex: number;
  activeSearchDrawingId: string | null;
}

export interface DrawSearchModeState {
  mode: "draw-search";
  drawings: Record<string, DrawSearchDrawing>;
  museumSlots: DrawSearchMuseumSlot[];
  round: DrawSearchRoundState;
  promptAssignments: Record<string, DrawSearchPlayerPromptAssignment>;
  effectiveFieldWidth: number;
  effectiveFieldHeight: number;
}

export interface DrawSearchDrawTask {
  mode: "DRAW";
  prompt: string;
  drawIndex: number;
  drawTotal: number;
}

export interface DrawSearchSearchTask {
  mode: "SEARCH";
  prompt: string;
  drawingId: string;
  artistName: string;
}

export type DrawSearchPlayerTask = DrawSearchDrawTask | DrawSearchSearchTask;

export type DrawSearchClientAction =
    | { type: "submit-drawing"; imageDataUrl: string }
    | { type: "search-snapshot"; centerX: number; centerY: number; radius: number }
    | { type: "start-round" }
    | { type: "set-timer"; drawDurationSec: number; searchDurationSec: number };

export type DrawSearchServerEvent =
    | { type: "assign-task"; task: DrawSearchPlayerTask }
    | { type: "search-result"; correct: boolean; drawingId: string; message: string }
    | { type: "score-update"; playerId: string; newScore: number; reason: string }
    | { type: "round-phase"; phase: DrawSearchGamePhase; endsAt: number }
    | { type: "player-phase"; playerId: string; playerPhase: DrawSearchPlayerPhase }
    | {
  type: "draw-search-config";
  fieldWidth: number;
  fieldHeight: number;
  maxDrawingsPerRound: number;
  searchOverscroll: number;
  initialZoom: number;
  imageSizePx: number;
  fieldBaseSize: number;
  fieldGrowthPerDrawing: number;
  fieldMaxSize: number;
};

export interface GardenInventoryItem {
  plantId: string;
  seeds: number;
  harvestedGoods: number;
}

export interface GardenPlantDefinition {
  id: string;
  name: string;
  unlockLevel: number;
  growthDurationSec: number;
  waterIntervalSec: number;
  harvestSeedYieldMin: number;
  harvestSeedYieldMax: number;
  harvestGoodsYieldMin: number;
  harvestGoodsYieldMax: number;
  experienceReward: number;
}

export type GardenPlotStatus = "EMPTY" | "GROWING" | "READY" | "PAUSED_BY_PEST";

export interface GardenPlotState {
  id: string;
  status: GardenPlotStatus;
  plantId: string | null;
  plantedAt: number | null;
  growthReadyAt: number | null;
  nextWaterDueAt: number | null;
  pestSince: number | null;
  lastCaretakerPlayerId: string | null;
}

export interface GardenCustomerOrder {
  id: string;
  requestedPlantId: string;
  requestedAmount: number;
  fulfilledAmount: number;
  createdAt: number;
  experienceReward: number;
}

export interface GardenModeState {
  mode: "garden-coop";
  level: number;
  experiencePoints: number;
  unlockedPlantIds: string[];
  inventory: Record<string, GardenInventoryItem>;
  plots: Record<string, GardenPlotState>;
  customerOrders: Record<string, GardenCustomerOrder>;
  plantDefinitions: Record<string, GardenPlantDefinition>;
}

export type GardenClientAction =
    | { type: "plant-seed"; plotId: string; plantId: string }
    | { type: "water-plant"; plotId: string }
    | { type: "harvest-plant"; plotId: string }
    | { type: "clear-pest"; plotId: string }
    | { type: "fulfill-order"; orderId: string; plantId: string; amount: number };

export type GardenServerEvent =
    | { type: "garden-level-up"; newLevel: number }
    | { type: "garden-plot-ready"; plotId: string; plantId: string }
    | { type: "garden-plot-needs-water"; plotId: string; plantId: string }
    | { type: "garden-pest-spawned"; plotId: string; plantId: string }
    | { type: "garden-order-fulfilled"; orderId: string; experienceGained: number };

export type TeamGraffitiTeamId = "RED" | "BLUE";

export interface TeamGraffitiTag {
  id: string;
  buildingId: string;
  placedByPlayerId: string;
  teamId: TeamGraffitiTeamId;
  placedAt: number;
  removedAt: number | null;
  wipeProgress: number;
  active: boolean;
}

export interface TeamGraffitiBuilding {
  id: string;
  name: string;
  x: number;
  y: number;
}

export interface TeamGraffitiModeState {
  mode: "team-graffiti";
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  teams: Record<TeamGraffitiTeamId, { score: number }>;
  buildings: Record<string, TeamGraffitiBuilding>;
  activeTags: Record<string, TeamGraffitiTag>;
  removedTags: Record<string, TeamGraffitiTag>;
}

export type TeamGraffitiClientAction =
    | { type: "assign-team"; playerId: string; teamId: TeamGraffitiTeamId }
    | { type: "place-tag"; buildingId: string }
    | { type: "wipe-tag"; tagId: string; progressDelta: number }
    | { type: "start-team-round"; durationSec: number };

export type TeamGraffitiServerEvent =
    | { type: "team-assigned"; playerId: string; teamId: TeamGraffitiTeamId }
    | { type: "tag-placed"; tagId: string; buildingId: string; teamId: TeamGraffitiTeamId }
    | { type: "tag-removed"; tagId: string; removedByPlayerId: string; scoreAwarded: number }
    | { type: "team-score-updated"; teamId: TeamGraffitiTeamId; newScore: number };

export type GameClientActionMap = {
  "draw-search": DrawSearchClientAction;
  "garden-coop": GardenClientAction;
  "team-graffiti": TeamGraffitiClientAction;
};

export type GameServerEventMap = {
  "draw-search": DrawSearchServerEvent;
  "garden-coop": GardenServerEvent;
  "team-graffiti": TeamGraffitiServerEvent;
};

export type GameClientEnvelope =
    | { type: "game-action"; mode: "draw-search"; action: DrawSearchClientAction }
    | { type: "game-action"; mode: "garden-coop"; action: GardenClientAction }
    | { type: "game-action"; mode: "team-graffiti"; action: TeamGraffitiClientAction };

export type GameServerEnvelope =
    | { type: "game-event"; mode: "draw-search"; event: DrawSearchServerEvent }
    | { type: "game-event"; mode: "garden-coop"; event: GardenServerEvent }
    | { type: "game-event"; mode: "team-graffiti"; event: TeamGraffitiServerEvent };

export type ClientToServerMessage = SessionClientToServerMessage | GameClientEnvelope;
export type ServerToClientMessage = SessionServerToClientMessage | GameServerEnvelope;

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  const flooredValue = Math.floor(value);

  if (flooredValue < min) {
    return min;
  }

  if (flooredValue > max) {
    return max;
  }

  return flooredValue;
}