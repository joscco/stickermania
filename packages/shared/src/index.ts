// ─── Config types ────────────────────────────────────────────────

export interface StickerPackConfig {
    id: string;
    name: string;
    /** Sprite symbol id for the pack icon, e.g. "pack-icon-shape" */
    iconId?: string;
    unlockedAtStart: boolean;
    stickers: string[];
}

export interface StickerCatalogConfig {
    packs: StickerPackConfig[];
}

export interface StickerCollageGameConfig {
    roundDurationSec: number;
    votingDurationSec: number;
    resultsDurationSec: number;
    maxStickersOnCanvas: number;
    votesPerPlayer: number;
    prompts: PromptConfig[];
    tasks: MinigameTask[];
    promptChoiceCount: number;
    packUnlockChoiceCount: number;
    catalog: StickerCatalogConfig;
}

export interface PromptConfig {
    text: string;
    recommendedPackIds?: string[];
}

export interface GameConfig {
    port: number;
    adminPassword: string | null;
    sessionTtlHours: number;
    stickerCollage: StickerCollageGameConfig;
}

function parseSubObject(raw: Record<string, unknown>, key: string): Record<string, unknown> {
    const sub = raw[key];
    return typeof sub === "object" && sub !== null ? sub as Record<string, unknown> : {};
}

// ── Default catalog (fallback when nothing is specified in config) ──────────

const DEFAULT_CATALOG_CONFIG: StickerCatalogConfig = {
    packs: []
};

function parseCatalogConfig(raw: unknown): StickerCatalogConfig {
    if (typeof raw !== "object" || raw === null) return DEFAULT_CATALOG_CONFIG;
    const r = raw as Record<string, unknown>;

    const packs = Array.isArray(r["packs"])
        ? (r["packs"] as unknown[]).filter(
              (p): p is StickerPackConfig =>
                  typeof p === "object" && p !== null && typeof (p as any).id === "string",
          )
        : DEFAULT_CATALOG_CONFIG.packs;

    return {packs};
}

function parsePrompts(raw: unknown): PromptConfig[] {
    if (!Array.isArray(raw)) return [{text: "Bau ein Monster"}, {text: "Mach eine Geburtstagstorte"}];
    return raw.map((p: any) => {
        if (typeof p === "string") return {text: p};
        if (typeof p === "object" && p !== null && typeof p.text === "string") {
            return {
                text: p.text,
                recommendedPackIds: Array.isArray(p.recommendedPackIds) ? p.recommendedPackIds : undefined,
            };
        }
        return {text: String(p)};
    });
}

function parseTasks(raw: unknown): MinigameTask[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((t: any): MinigameTask => {
        const base: MinigameTask = {
            type: (t?.type === "sticker-place" || t?.type === "drawing" || t?.type === "choice" || t?.type === "number" || t?.type === "timer-stop" || t?.type === "shape-split") ? t.type : "choice",
            prompt: typeof t?.prompt === "string" ? t.prompt : "",
            durationSec: typeof t?.durationSec === "number" ? t.durationSec : 60,
        };
        if (typeof t?.baseImageUrl === "string") base.baseImageUrl = t.baseImageUrl;
        if (typeof t?.shapePoints === "string") base.shapePoints = t.shapePoints;
        if (Array.isArray(t?.options)) base.options = t.options.map((o: any) => ({label: String(o?.label ?? ""), emoji: typeof o?.emoji === "string" ? o.emoji : undefined}));
        if (t?.numberConfig && typeof t.numberConfig === "object") {
            base.numberConfig = {
                min: typeof t.numberConfig.min === "number" ? t.numberConfig.min : 1,
                max: typeof t.numberConfig.max === "number" ? t.numberConfig.max : 100,
                default: typeof t.numberConfig.default === "number" ? t.numberConfig.default : 50,
            };
        }
        if (typeof t?.timerTarget === "number") base.timerTarget = t.timerTarget;
        if (Array.isArray(t?.polygon)) {
            base.polygon = t.polygon
                .filter((p: any) => typeof p?.x === "number" && typeof p?.y === "number")
                .map((p: any) => ({x: p.x, y: p.y}));
        }
        if (typeof t?.targetFraction === "number") base.targetFraction = Math.max(0, Math.min(1, t.targetFraction));
        return base;
    });
}

export function parseGameConfig(raw: unknown): GameConfig {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
    const sc = parseSubObject(r, "stickerCollage");

    return {
        port: typeof r["port"] === "number" ? r["port"] : 3001,
        adminPassword: typeof r["adminPassword"] === "string" ? r["adminPassword"] : null,
        sessionTtlHours: typeof r["sessionTtlHours"] === "number" ? r["sessionTtlHours"] : 24,
        stickerCollage: {
            roundDurationSec: typeof sc["roundDurationSec"] === "number" ? sc["roundDurationSec"] : 600,
            votingDurationSec: typeof sc["votingDurationSec"] === "number" ? sc["votingDurationSec"] : 120,
            resultsDurationSec: typeof sc["resultsDurationSec"] === "number" ? sc["resultsDurationSec"] : 60,
            maxStickersOnCanvas: typeof sc["maxStickersOnCanvas"] === "number" ? sc["maxStickersOnCanvas"] : 12,
            votesPerPlayer: typeof sc["votesPerPlayer"] === "number" ? sc["votesPerPlayer"] : 3,
            prompts: parsePrompts(sc["prompts"]),
            tasks: parseTasks(sc["tasks"]),
            promptChoiceCount: typeof sc["promptChoiceCount"] === "number" ? sc["promptChoiceCount"] : 3,
            packUnlockChoiceCount: typeof sc["packUnlockChoiceCount"] === "number" ? sc["packUnlockChoiceCount"] : 3,
            catalog: parseCatalogConfig(sc["catalog"] ?? null),
        },
    };
}

export type ClientKind = "player" | "board";

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

export interface SessionState {
    sessionId: string;
    sessionCode: string;
    players: Record<string, SessionPlayer>;
    gameState: StickerCollageGameState;
    revision: number;
    updatedAt: number;
    createdAt: number;
    expiresAt: number;
}

export interface SessionInfo {
    sessionId: string;
    sessionCode: string;
    playerJoinUrl: string;
    boardUrl: string;
    createdAt: number;
    expiresAt: number;
}

export type SessionClientToServerMessage =
    | { type: "join"; kind: ClientKind; sessionId: string; playerId?: string }
    | { type: "set-name"; name: string }
    | { type: "submit-avatar"; avatarDataUrl: string }
    | { type: "start-game-session" }
    | { type: "reset-session" }
    | { type: "ping"; t: number };

export type SessionServerToClientMessage =
    | { type: "welcome"; clientId: string; playerId: string; sessionId: string; serverTime: number; serverSessionId: string }
    | { type: "session-state"; state: SessionState }
    | { type: "session-event"; text: string; createdAt: number }
    | { type: "error"; message: string }
    | { type: "pong"; t: number; serverTime: number };

// ─── Sticker-Collage types ─────────────────────────────────────

export interface StickerPack {
    id: string;
    name: string;
    /** Sprite symbol id for the pack icon, e.g. "pack-icon-eyes" */
    iconId?: string;
    stickerIds: string[];
    unlockedAtStart: boolean;
}

export interface StickerDefinition {
    id: string;
    imageUrl: string;
    packId?: string;
    /**
     * Optional polygon hitbox, defined as an array of {x, y} points
     * where coordinates are normalized 0–1 relative to the sticker's bounding box.
     * If absent, the full bounding rectangle is used for hit-testing.
     */
    hitboxPolygon?: Array<{ x: number; y: number }>;
    /**
     * Optional overlay bounds for the selection box.
     * {x, y} = center position, {w, h} = size, all normalized 0–1.
     * Falls back to the hitbox polygon extent if absent.
     */
    overlayBounds?: { x: number; y: number; w: number; h: number };
}

export interface StickerPlacement {
    instanceId: string;
    stickerId: string;
    /** Visual center X in canvas-local pixels. */
    x: number;
    /** Visual center Y in canvas-local pixels. */
    y: number;
    rotation: number;
    scale: number;
    zIndex: number;
    flipX?: boolean;
    flipY?: boolean;
    /** Non-uniform stretch: horizontal scale factor (multiplied on top of scale). */
    scaleX?: number;
    /** Non-uniform stretch: vertical scale factor (multiplied on top of scale). */
    scaleY?: number;
    /** Groups this sticker with others sharing the same groupId. */
    groupId?: string;
}

export interface StickerCollage {
    id: string;
    playerId: string;
    roundIndex: number;
    placements: StickerPlacement[];
    submittedAt: number;
    snapshotUrl?: string;
}

export interface StickerCollageVoteResult {
    collageId: string;
    playerId: string;
    voteCount: number;
    placement: number;
}

// ─── Phase-specific state slices ──────────────────────────────

export interface StickerCollageLobbyState {
    phase: "LOBBY";
}

export interface StickerCollageBuildingState {
    phase: "BUILDING";
    roundEndsAt: number;
    skippedPlayerIds: string[];
}

export interface StickerCollageVotingState {
    phase: "VOTING";
    votingEndsAt: number;
    currentVotes: Record<string, string[]>;
    doneVotingIds: string[];
}

export interface StickerCollageResultsState {
    phase: "RESULTS";
    resultsEndsAt: number;
    lastVoteResults: StickerCollageVoteResult[];
    winnerId: string | null;
    /** Player IDs that tied for first place but were not selected as winner */
    tiedWinnerIds: string[];
    promptChoices: string[];
    packUnlockChoices: string[];
    lastUnlockedPackId: string | null;
    winnerChoicesDone: boolean;
    readyToAdvanceIds: string[];
}

export interface StickerCollageNextRoundSetupState {
    phase: "NEXT_ROUND_SETUP";
}

export type StickerCollagePhaseState =
    | StickerCollageLobbyState
    | StickerCollageBuildingState
    | StickerCollageVotingState
    | StickerCollageResultsState
    | StickerCollageNextRoundSetupState;

// ─── Game state ───────────────────────────────────────────────

export interface StickerCollageGameState {
    currentRoundIndex: number;
    currentPrompt: string;
    currentTask: MinigameTask | null;
    currentRecommendedPackIds: string[];
    roundStartedAt: number | null;
    stickerCatalog: StickerDefinition[];
    stickerPacks: StickerPack[];
    unlockedPackIds: string[];
    submissions: Record<number, StickerCollage[]>;
    minigameSubmissions: Record<number, MinigameSubmission[]>;
    promptHistory: Record<number, string>;
    roundParticipantIds: string[];
    maxStickersOnCanvas: number;
    votesPerPlayer: number;
    phaseState: StickerCollagePhaseState;
    roundDurationSec: number;
    votingDurationSec: number;
    resultsDurationSec: number;
}

export type StickerCollageClientAction =
    | { type: "submit-collage"; placements: StickerPlacement[] }
    | { type: "skip-round" }
    | { type: "cast-vote"; collageId: string }
    | { type: "done-voting" }
    | { type: "ready-to-advance" }
    | { type: "start-game" }
    | { type: "end-round-early" }
    | { type: "end-voting-early" }
    | { type: "pick-prompt"; prompt: string }
    | { type: "unlock-pack"; packId: string }
    | { type: "advance-from-results" };

export type StickerCollageServerEvent =
    | { type: "game-started" }
    | { type: "round-started"; roundIndex: number; prompt: string; endsAt: number }
    | { type: "collage-submitted"; playerId: string; collageId: string }
    | { type: "voting-started"; votingEndsAt: number }
    | { type: "vote-registered"; voterId: string; collageId: string }
    | { type: "vote-unregistered"; voterId: string; collageId: string }
    | { type: "results-ready"; winnerId: string | null; results: StickerCollageVoteResult[] }
    | { type: "pack-unlocked"; packId: string; packName: string }
    | { type: "prompt-chosen"; prompt: string }
    | { type: "round-ended"; roundIndex: number; results: StickerCollageVoteResult[] };

export type GameClientAction = StickerCollageClientAction | MinigameClientAction;

export type GameClientEnvelope = {
    type: "game-action";
    action: GameClientAction;
};

export type GameServerEnvelope = {
    type: "game-event";
    event: StickerCollageServerEvent;
    targetPlayerId?: string;
};

export type ClientToServerMessage = SessionClientToServerMessage | GameClientEnvelope;
export type ServerToClientMessage = SessionServerToClientMessage | GameServerEnvelope;

// ─── Minigame types (new) ───────────────────────────────────────

export type MinigameTaskType =
  | "sticker-place"
  | "drawing"
  | "choice"
  | "number"
  | "timer-stop"
  | "shape-split";

export interface MinigameTask {
  type: MinigameTaskType;
  prompt: string;
  baseImageUrl?: string;
  shapePoints?: string;
  options?: Array<{label: string; emoji?: string}>;
  numberConfig?: {min: number; max: number; default: number};
  timerTarget?: number;
  /** Polygon vertices for shape-split tasks (viewBox-local coords) */
  polygon?: Array<{x: number; y: number}>;
  /** Target fraction (0-1) for shape-split tasks */
  targetFraction?: number;
  durationSec: number;
}

export interface StickerPlaceSubmission {
  type: "sticker-place";
  playerId: string;
  roundIndex: number;
  position: {x: number; y: number};
  stickerId: string;
  submittedAt: number;
}

export interface DrawingSubmission {
  type: "drawing";
  playerId: string;
  roundIndex: number;
  imageDataUrl: string;
  submittedAt: number;
}

export interface ChoiceSubmission {
  type: "choice";
  playerId: string;
  roundIndex: number;
  selectedIndices: number[];
  submittedAt: number;
}

export interface NumberSubmission {
  type: "number";
  playerId: string;
  roundIndex: number;
  value: number;
  submittedAt: number;
}

export interface TimerStopSubmission {
  type: "timer-stop";
  playerId: string;
  roundIndex: number;
  elapsedSec: number;
  submittedAt: number;
}

export interface ShapeSplitSubmission {
  type: "shape-split";
  playerId: string;
  roundIndex: number;
  /** Two points defining the cut line (each 0-1 in polygon-local coords) */
  cutLine: {a: {x: number; y: number}; b: {x: number; y: number}};
  /** Normalized area of one side (0-1, the smaller or first side) */
  areaFraction: number;
  submittedAt: number;
}

export type MinigameSubmission =
  | StickerPlaceSubmission
  | DrawingSubmission
  | ChoiceSubmission
  | NumberSubmission
  | TimerStopSubmission
  | ShapeSplitSubmission;

export interface MinigameConfig {
  roundDurationSec: number;
  votingDurationSec: number;
  resultsDurationSec: number;
  tasks: MinigameTask[];
}

export type MinigameClientAction =
  | { type: "submit-sticker-place"; position: {x: number; y: number}; stickerId: string }
  | { type: "submit-drawing"; imageDataUrl: string }
  | { type: "submit-choice"; selectedIndices: number[] }
  | { type: "submit-number"; value: number }
  | { type: "submit-timer"; elapsedSec: number }
  | { type: "submit-shape-split"; cutLine: {a: {x: number; y: number}; b: {x: number; y: number}}; areaFraction: number }
  | { type: "skip-round" }
  | { type: "cast-vote"; submissionId: string }
  | { type: "done-voting" }
  | { type: "ready-to-advance" }
  | { type: "start-game" }
  | { type: "end-round-early" }
  | { type: "end-voting-early" }
  | { type: "advance-from-results" };

export type MinigameServerEvent =
  | StickerCollageServerEvent
  | { type: "task-changed"; task: MinigameTask };

