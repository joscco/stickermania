// Shared types for the birthday party platform with multiple game modes

// ─── Config types ────────────────────────────────────────────────

export interface DrawSearchGameConfig {
  drawPrompts: string[];
  canvasResolution: number;
  /** How many fake captions to collect per drawing before it becomes guessable */
  fakeCaptionsPerDrawing: number;
  /** Points awarded for guessing the real title */
  pointsCorrectGuess: number;
  /** Points awarded when your fake caption fools someone */
  pointsFooledPlayer: number;
  /** If > 0, inject test drawings on startMode */
  seedTestDrawings: number;
}

export interface GardenCoopGameConfig {
  plotCount: number;
  initialSeeds: number;
  pestChance: number;
}

export interface TeamGraffitiGameConfig {
  roundDurationSec: number;
  /** Seconds between automatic action grants */
  actionAccrualIntervalSec: number;
  /** Maximum actions a player can hold */
  maxActions: number;
  /** Actions granted to each player at round start */
  initialActions: number;
}

export interface StickerCollageGameConfig {
  roundDurationSec: number;
  handSize: number;
  maxStickersOnCanvas: number;
  swapCount: number;
  votesPerPlayer: number;
  pointsByPlacement: number[];
  requiredCategories: string[];
  prompts: string[];
}

export interface GameConfig {
  // General
  drawingsPath: string;
  port: number;
  adminPassword: string | null;
  sessionTtlHours: number;
  // Per-mode
  drawSearch: DrawSearchGameConfig;
  gardenCoop: GardenCoopGameConfig;
  teamGraffiti: TeamGraffitiGameConfig;
  stickerCollage: StickerCollageGameConfig;
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
  const sc = parseSubObject(r, "stickerCollage");

  return {
    drawingsPath: typeof r["drawingsPath"] === "string" ? r["drawingsPath"] : "./drawings",
    port: typeof r["port"] === "number" ? r["port"] : 3001,
    adminPassword: typeof r["adminPassword"] === "string" ? r["adminPassword"] : null,
    sessionTtlHours: typeof r["sessionTtlHours"] === "number" ? r["sessionTtlHours"] : 24,
    drawSearch: {
      drawPrompts: Array.isArray(ds["drawPrompts"] ?? r["drawPrompts"]) ? (ds["drawPrompts"] ?? r["drawPrompts"]) as string[] : ["Katze", "Hund", "Sonne"],
      canvasResolution: typeof (ds["canvasResolution"] ?? r["canvasResolution"]) === "number" ? (ds["canvasResolution"] ?? r["canvasResolution"]) as number : 400,
      fakeCaptionsPerDrawing: typeof ds["fakeCaptionsPerDrawing"] === "number" ? ds["fakeCaptionsPerDrawing"] : 2,
      pointsCorrectGuess: typeof ds["pointsCorrectGuess"] === "number" ? ds["pointsCorrectGuess"] : 100,
      pointsFooledPlayer: typeof ds["pointsFooledPlayer"] === "number" ? ds["pointsFooledPlayer"] : 50,
      seedTestDrawings: typeof ds["seedTestDrawings"] === "number" ? ds["seedTestDrawings"] : 0,
    },
    gardenCoop: {
      plotCount: typeof gc["plotCount"] === "number" ? gc["plotCount"] : 6,
      initialSeeds: typeof gc["initialSeeds"] === "number" ? gc["initialSeeds"] : 3,
      pestChance: typeof gc["pestChance"] === "number" ? gc["pestChance"] : 0.15,
    },
    teamGraffiti: {
      roundDurationSec: typeof tg["roundDurationSec"] === "number" ? tg["roundDurationSec"] : 300,
      actionAccrualIntervalSec: typeof tg["actionAccrualIntervalSec"] === "number" ? tg["actionAccrualIntervalSec"] : 60,
      maxActions: typeof tg["maxActions"] === "number" ? tg["maxActions"] : 5,
      initialActions: typeof tg["initialActions"] === "number" ? tg["initialActions"] : 2,
    },
    stickerCollage: {
      roundDurationSec: typeof sc["roundDurationSec"] === "number" ? sc["roundDurationSec"] : 600,
      handSize: typeof sc["handSize"] === "number" ? sc["handSize"] : 8,
      maxStickersOnCanvas: typeof sc["maxStickersOnCanvas"] === "number" ? sc["maxStickersOnCanvas"] : 12,
      swapCount: typeof sc["swapCount"] === "number" ? sc["swapCount"] : 2,
      votesPerPlayer: typeof sc["votesPerPlayer"] === "number" ? sc["votesPerPlayer"] : 3,
      pointsByPlacement: Array.isArray(sc["pointsByPlacement"]) ? sc["pointsByPlacement"] as number[] : [100, 60, 30],
      requiredCategories: Array.isArray(sc["requiredCategories"]) ? sc["requiredCategories"] as string[] : ["eyes"],
      prompts: Array.isArray(sc["prompts"]) ? sc["prompts"] as string[] : ["Bau ein Monster", "Mach eine Geburtstagstorte"],
    },
  };
}

export type ClientKind = "player" | "board";

export type GameModeId = "draw-search" | "garden-coop" | "team-graffiti" | "sticker-collage";

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
}
    | { type: "session-state"; state: SessionState }
    | { type: "session-event"; text: string; createdAt: number }
    | { type: "error"; message: string }
    | { type: "pong"; t: number; serverTime: number };

/** Game phase for draw-search. Always ACTIVE (kept for backwards compatibility). */
export type DrawSearchGamePhase = "ACTIVE";

// ─── Drawing ─────────────────────────────────────────────────

export interface DrawSearchDrawing {
  id: string;
  artistId: string;
  prompt: string;
  imageUrl: string;
  imageAssetPath: string;
  placedAt: number;
}

// ─── Caption ─────────────────────────────────────────────────

export interface DrawSearchCaption {
  id: string;
  drawingId: string;
  text: string;
  authorId: string;
  /** True if this caption IS the real prompt (auto-generated by the system). */
  isReal: boolean;
}

// ─── Guess ───────────────────────────────────────────────────

export interface DrawSearchPlayerGuess {
  drawingId: string;
  chosenCaptionId: string;
  playerId: string;
  isCorrect: boolean;
}

// ─── Mode state ──────────────────────────────────────────────

export interface DrawSearchModeState {
  mode: "draw-search";
  phase: DrawSearchGamePhase;
  drawings: Record<string, DrawSearchDrawing>;
  captions: Record<string, DrawSearchCaption>;
  /** All guesses ever submitted. playerId → list of guesses. */
  playerGuesses: Record<string, DrawSearchPlayerGuess[]>;
}

// ─── Player tasks (sent individually) ────────────────────────

export interface DrawSearchDrawTask {
  mode: "DRAW";
  prompt: string;
}

export interface DrawSearchCaptionTask {
  mode: "CAPTION";
  drawingId: string;
  imageUrl: string;
}

export interface DrawSearchGuessTask {
  mode: "GUESS";
  drawingId: string;
  imageUrl: string;
  artistName: string;
  captions: Array<{ id: string; text: string }>;
}

export type DrawSearchPlayerTask = DrawSearchDrawTask | DrawSearchCaptionTask | DrawSearchGuessTask;

// ─── Client actions ──────────────────────────────────────────

export type DrawSearchClientAction =
    | { type: "submit-drawing"; imageDataUrl: string }
    | { type: "submit-caption"; drawingId: string; text: string }
    | { type: "submit-guess"; drawingId: string; captionId: string };

// ─── Server events ───────────────────────────────────────────

export type DrawSearchServerEvent =
    | { type: "assign-task"; targetPlayerId: string; task: DrawSearchPlayerTask }
    | { type: "score-update"; playerId: string; newScore: number; reason: string }
    | { type: "round-phase"; phase: DrawSearchGamePhase }
    | { type: "guess-result"; targetPlayerId: string; drawingId: string; correct: boolean; message: string; correctTitle: string }
    | { type: "caption-rejected"; targetPlayerId: string; drawingId: string; reason: string };

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

export type TeamGraffitiTeamId = "DIAMOND" | "HEART";

export const TEAM_GRAFFITI_HOUSE_TYPES = ["A", "B", "C"] as const;
export type TeamGraffitiHouseType = (typeof TEAM_GRAFFITI_HOUSE_TYPES)[number];

export interface TeamGraffitiHouse {
  id: string;
  houseType: TeamGraffitiHouseType;
  /** Position in the city scene (logical coordinates) */
  x: number;
  y: number;
  /** Whether the house sprite is horizontally flipped */
  flipped: boolean;
  /** Which team currently owns (tagged) this house, or null */
  owner: TeamGraffitiTeamId | null;
  /** Which PNG variant to show (0 or 1) */
  tagVariant: 0 | 1;
  /** Timestamp when current owner claimed this house (for score calc) */
  ownedSince: number | null;
}

export interface TeamGraffitiPlayerActions {
  actions: number;
  lastAccrualAt: number;
}

export interface TeamGraffitiModeState {
  mode: "team-graffiti";
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  teams: Record<TeamGraffitiTeamId, { score: number }>;
  houses: Record<string, TeamGraffitiHouse>;
  playerActions: Record<string, TeamGraffitiPlayerActions>;
  actionAccrualIntervalSec: number;
  maxActions: number;
  /** Logical scene dimensions */
  sceneWidth: number;
  sceneHeight: number;
}

export type TeamGraffitiClientAction =
    | { type: "assign-team"; playerId: string; teamId: TeamGraffitiTeamId }
    | { type: "tag-house"; houseId: string }
    | { type: "start-team-round"; durationSec: number };

export type TeamGraffitiServerEvent =
    | { type: "team-assigned"; playerId: string; teamId: TeamGraffitiTeamId }
    | { type: "house-tagged"; houseId: string; teamId: TeamGraffitiTeamId; tagVariant: 0 | 1 }
    | { type: "team-score-updated"; teamId: TeamGraffitiTeamId; newScore: number }
    | { type: "actions-updated"; playerId: string; actions: number };

// ─── Sticker-Collage types ─────────────────────────────────────

export interface StickerDefinition {
  id: string;
  imageUrl: string;
  categories: string[];
}

export interface StickerPlacement {
  stickerId: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  zIndex: number;
}

export interface StickerHand {
  stickerIds: string[];
  swapsRemaining: number;
}

export interface StickerCollage {
  id: string;
  playerId: string;
  roundIndex: number;
  placements: StickerPlacement[];
  submittedAt: number;
}

export type StickerCollageRoundPhase = "BUILDING" | "REVIEWING";

export interface StickerCollageVoteResult {
  collageId: string;
  playerId: string;
  voteCount: number;
  pointsAwarded: number;
}

export interface StickerCollageModeState {
  mode: "sticker-collage";
  currentRoundIndex: number;
  phase: StickerCollageRoundPhase;
  currentPrompt: string;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  /** All available stickers for the game */
  stickerCatalog: StickerDefinition[];
  /** Player hands for the current round */
  playerHands: Record<string, StickerHand>;
  /** Submissions grouped by round index */
  submissions: Record<number, StickerCollage[]>;
  /** Votes for previous round: voterId → collageId[] */
  currentVotes: Record<string, string[]>;
  /** Results from the last completed voting */
  lastVoteResults: StickerCollageVoteResult[];
  /** Prompt history (index → prompt) */
  promptHistory: Record<number, string>;
  /** Config echoed into state for client use */
  handSize: number;
  maxStickersOnCanvas: number;
  swapCount: number;
  votesPerPlayer: number;
}

export type StickerCollageClientAction =
    | { type: "request-hand" }
    | { type: "swap-sticker"; handIndex: number; newStickerId: string }
    | { type: "submit-collage"; placements: StickerPlacement[] }
    | { type: "cast-vote"; collageId: string }
    | { type: "start-round" };

export type StickerCollageServerEvent =
    | { type: "hand-dealt"; targetPlayerId: string; hand: StickerHand }
    | { type: "round-started"; roundIndex: number; prompt: string; endsAt: number }
    | { type: "collage-submitted"; playerId: string; collageId: string }
    | { type: "vote-registered"; voterId: string; collageId: string }
    | { type: "round-ended"; roundIndex: number; results: StickerCollageVoteResult[] }
    | { type: "score-update"; playerId: string; newScore: number };

export type GameClientActionMap = {
  "draw-search": DrawSearchClientAction;
  "garden-coop": GardenClientAction;
  "team-graffiti": TeamGraffitiClientAction;
  "sticker-collage": StickerCollageClientAction;
};

export type GameServerEventMap = {
  "draw-search": DrawSearchServerEvent;
  "garden-coop": GardenServerEvent;
  "team-graffiti": TeamGraffitiServerEvent;
  "sticker-collage": StickerCollageServerEvent;
};

export type GameClientEnvelope =
    | { type: "game-action"; mode: "draw-search"; action: DrawSearchClientAction }
    | { type: "game-action"; mode: "garden-coop"; action: GardenClientAction }
    | { type: "game-action"; mode: "team-graffiti"; action: TeamGraffitiClientAction }
    | { type: "game-action"; mode: "sticker-collage"; action: StickerCollageClientAction };

export type GameServerEnvelope =
    | { type: "game-event"; mode: "draw-search"; event: DrawSearchServerEvent; targetPlayerId?: string }
    | { type: "game-event"; mode: "garden-coop"; event: GardenServerEvent; targetPlayerId?: string }
    | { type: "game-event"; mode: "team-graffiti"; event: TeamGraffitiServerEvent; targetPlayerId?: string }
    | { type: "game-event"; mode: "sticker-collage"; event: StickerCollageServerEvent; targetPlayerId?: string };

export type ClientToServerMessage = SessionClientToServerMessage | GameClientEnvelope;
export type ServerToClientMessage = SessionServerToClientMessage | GameServerEnvelope;