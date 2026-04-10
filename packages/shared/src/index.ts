// ─── Config types ────────────────────────────────────────────────

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
    port: number;
    adminPassword: string | null;
    sessionTtlHours: number;
    stickerCollage: StickerCollageGameConfig;
}

function parseSubObject(raw: Record<string, unknown>, key: string): Record<string, unknown> {
    const sub = raw[key];
    return typeof sub === "object" && sub !== null ? sub as Record<string, unknown> : {};
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
    instanceId: string;
    stickerId: string;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    zIndex: number;
    flipX?: boolean;
    flipY?: boolean;
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
    snapshotUrl?: string;
}

export interface StickerCollageVoteResult {
    collageId: string;
    playerId: string;
    voteCount: number;
    pointsAwarded: number;
}

// ─── Phase-specific state slices ──────────────────────────────

export interface StickerCollageLobbyState {
    phase: "LOBBY";
}

export interface StickerCollageBuildingState {
    phase: "BUILDING";
    roundEndsAt: number;
    playerHands: Record<string, StickerHand>;
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
    promptChoices: string[];
    packUnlockChoices: string[];
    guaranteedPackChoices: string[];
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
    roundStartedAt: number | null;
    stickerCatalog: StickerDefinition[];
    stickerPacks: StickerPack[];
    unlockedPackIds: string[];
    guaranteedPackId: string | null;
    submissions: Record<number, StickerCollage[]>;
    promptHistory: Record<number, string>;
    roundParticipantIds: string[];
    handSize: number;
    maxStickersOnCanvas: number;
    swapCount: number;
    votesPerPlayer: number;
    phaseState: StickerCollagePhaseState;
}

export type StickerCollageClientAction =
    | { type: "request-hand" }
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

export type GameClientEnvelope = {
    type: "game-action";
    action: StickerCollageClientAction;
};

export type GameServerEnvelope = {
    type: "game-event";
    event: StickerCollageServerEvent;
    targetPlayerId?: string;
};

export type ClientToServerMessage = SessionClientToServerMessage | GameClientEnvelope;
export type ServerToClientMessage = SessionServerToClientMessage | GameServerEnvelope;

