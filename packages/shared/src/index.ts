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
    votingDurationSec: number;
    resultsDurationSec: number;
    handSize: number;
    maxStickersOnCanvas: number;
    swapCount: number;
    votesPerPlayer: number;
    pointsByPlacement: number[];
    requiredCategories: string[];
    prompts: string[];
    promptChoiceCount: number;
    packUnlockChoiceCount: number;
}

export interface GameConfig {
    // General
    drawingsPath: string;
    port: number;
    adminPassword: string | null;
    sessionTtlHours: number;
    // Per-mode
    stickerCollage: StickerCollageGameConfig;
}

function parseSubObject(raw: Record<string, unknown>, key: string): Record<string, unknown> {
    const sub = raw[key];
    return typeof sub === "object" && sub !== null ? sub as Record<string, unknown> : {};
}

export function parseGameConfig(raw: unknown): GameConfig {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

    // Support flat legacy configs by also reading top-level keys
    const sc = parseSubObject(r, "stickerCollage");

    return {
        drawingsPath: typeof r["drawingsPath"] === "string" ? r["drawingsPath"] : "./drawings",
        port: typeof r["port"] === "number" ? r["port"] : 3001,
        adminPassword: typeof r["adminPassword"] === "string" ? r["adminPassword"] : null,
        sessionTtlHours: typeof r["sessionTtlHours"] === "number" ? r["sessionTtlHours"] : 24,
        stickerCollage: {
            roundDurationSec: typeof sc["roundDurationSec"] === "number" ? sc["roundDurationSec"] : 600,
            votingDurationSec: typeof sc["votingDurationSec"] === "number" ? sc["votingDurationSec"] : 120,
            resultsDurationSec: typeof sc["resultsDurationSec"] === "number" ? sc["resultsDurationSec"] : 60,
            handSize: typeof sc["handSize"] === "number" ? sc["handSize"] : 8,
            maxStickersOnCanvas: typeof sc["maxStickersOnCanvas"] === "number" ? sc["maxStickersOnCanvas"] : 12,
            swapCount: typeof sc["swapCount"] === "number" ? sc["swapCount"] : 2,
            votesPerPlayer: typeof sc["votesPerPlayer"] === "number" ? sc["votesPerPlayer"] : 3,
            pointsByPlacement: Array.isArray(sc["pointsByPlacement"]) ? sc["pointsByPlacement"] as number[] : [100, 60, 30],
            requiredCategories: Array.isArray(sc["requiredCategories"]) ? sc["requiredCategories"] as string[] : ["eyes"],
            prompts: Array.isArray(sc["prompts"]) ? sc["prompts"] as string[] : ["Bau ein Monster", "Mach eine Geburtstagstorte"],
            promptChoiceCount: typeof sc["promptChoiceCount"] === "number" ? sc["promptChoiceCount"] : 3,
            packUnlockChoiceCount: typeof sc["packUnlockChoiceCount"] === "number" ? sc["packUnlockChoiceCount"] : 3,
        },
    };
}

export type ClientKind = "player" | "board";

export type GameModeId = "sticker-collage";

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

export interface DrawSearchDrawTask {
    mode: "DRAW";
    prompt: string;
}

export type DrawSearchPlayerTask = DrawSearchDrawTask
// ─── Sticker-Collage types ─────────────────────────────────────

export interface StickerPack {
    id: string;
    name: string;
    stickerIds: string[];
    unlockedAtStart: boolean;
}

export interface StickerDefinition {
    id: string;
    imageUrl: string;
    categories: string[];
    packId?: string;
    /**
     * Optional polygon hitbox, defined as an array of {x, y} points
     * where coordinates are normalized 0–1 relative to the sticker's bounding box.
     * If absent, the full bounding rectangle is used for hit-testing.
     */
    hitboxPolygon?: Array<{ x: number; y: number }>;
}

export interface StickerPlacement {
    /** Unique instance id (allows same sticker multiple times) */
    instanceId: string;
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
    /** URL to a pre-rendered PNG snapshot of the collage (set after upload) */
    snapshotUrl?: string;
}

export type StickerCollageRoundPhase = "LOBBY" | "BUILDING" | "VOTING" | "RESULTS" | "NEXT_ROUND_SETUP";

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
    votingEndsAt: number | null;
    resultsEndsAt: number | null;
    /** All available stickers for the game */
    stickerCatalog: StickerDefinition[];
    /** Sticker pack definitions */
    stickerPacks: StickerPack[];
    /** Which packs are currently unlocked */
    unlockedPackIds: string[];
    /** Pack guaranteed to appear in next round's hands */
    guaranteedPackId: string | null;
    /** Player hands for the current round */
    playerHands: Record<string, StickerHand>;
    /** Submissions grouped by round index */
    submissions: Record<number, StickerCollage[]>;
    /** Votes for current round: voterId → collageId[] */
    currentVotes: Record<string, string[]>;
    /** Results from the last completed voting */
    lastVoteResults: StickerCollageVoteResult[];
    /** Winner of the current/last round */
    winnerId: string | null;
    /** Prompt choices offered to the winner */
    promptChoices: string[];
    /** Locked pack IDs offered to the winner for unlocking */
    packUnlockChoices: string[];
    /** Unlocked pack IDs offered for guaranteed pick */
    guaranteedPackChoices: string[];
    /** The pack that was just unlocked (for display in NEXT_ROUND_SETUP) */
    lastUnlockedPackId: string | null;
    /** Whether the winner has made all their choices */
    winnerChoicesDone: boolean;
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
    | { type: "start-game" }
    | { type: "end-round-early" }
    | { type: "end-voting-early" }
    | { type: "pick-prompt"; prompt: string }
    | { type: "unlock-pack"; packId: string }
    | { type: "pick-guaranteed-pack"; packId: string }
    | { type: "advance-from-results" };

export type StickerCollageServerEvent =
    | { type: "hand-dealt"; targetPlayerId: string; hand: StickerHand }
    | { type: "game-started" }
    | { type: "round-started"; roundIndex: number; prompt: string; endsAt: number }
    | { type: "collage-submitted"; playerId: string; collageId: string }
    | { type: "voting-started"; votingEndsAt: number }
    | { type: "vote-registered"; voterId: string; collageId: string }
    | { type: "results-ready"; winnerId: string | null; results: StickerCollageVoteResult[] }
    | { type: "pack-unlocked"; packId: string; packName: string }
    | { type: "prompt-chosen"; prompt: string }
    | { type: "guaranteed-pack-chosen"; packId: string; packName: string }
    | { type: "round-ended"; roundIndex: number; results: StickerCollageVoteResult[] }
    | { type: "score-update"; playerId: string; newScore: number };

export type GameClientActionMap = {
    "sticker-collage": StickerCollageClientAction;
};

export type GameServerEventMap = {
    "sticker-collage": StickerCollageServerEvent;
};

export type GameClientEnvelope = { type: "game-action"; mode: "sticker-collage"; action: StickerCollageClientAction };

export type GameServerEnvelope = {
    type: "game-event";
    mode: "sticker-collage";
    event: StickerCollageServerEvent;
    targetPlayerId?: string
};

export type ClientToServerMessage = SessionClientToServerMessage | GameClientEnvelope;
export type ServerToClientMessage = SessionServerToClientMessage | GameServerEnvelope;