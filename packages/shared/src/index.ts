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
    minigame: MinigameConfig;
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
            promptChoiceCount: typeof sc["promptChoiceCount"] === "number" ? sc["promptChoiceCount"] : 3,
            packUnlockChoiceCount: typeof sc["packUnlockChoiceCount"] === "number" ? sc["packUnlockChoiceCount"] : 3,
            catalog: parseCatalogConfig(sc["catalog"] ?? null),
        },
        minigame: {tasks: []},
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

// ─── Minigame types ─────────────────────────────────────────────

// ── Task definitions (discriminated union) ─────────────────────

/** How the winner is determined for sticker placement games */
export type StickerPlaceGoal = 'closest-to-average' | 'furthest-from-average';

export interface StickerPlaceTask {
  id: string;
  type: "sticker-place";
  title: string;
  durationSec: number;
  /** Sprite refs for the stickers the player places, e.g. "sticker-shapes-heart" */
  stickerSvgs: string[];
  /** Optional background image sprite ref, e.g. "sprite:#sticker-eyes-open" */
  backgroundSvg?: string;
  /** How the winner is determined. Default: closest-to-average */
  goal?: StickerPlaceGoal;
}

export interface DrawingTask {
  id: string;
  type: "drawing";
  title: string;
  durationSec: number;
  /** Optional background image sprite ref to draw on */
  backgroundSvg?: string;
  /** Secret additional tasks — one per player, others must guess which was applied */
  extraTasks?: string[];
}

export interface ChoiceTask {
  id: string;
  type: "choice";
  title: string;
  durationSec: number;
  options: Array<{label: string; emoji?: string}>;
}

export interface NumberTask {
  id: string;
  type: "number";
  title: string;
  durationSec: number;
  min: number;
  max: number;
  default: number;
}

export interface TimerStopTask {
  id: string;
  type: "timer-stop";
  title: string;
  durationSec: number;
  targetSec: number;
}

export interface ShapeSplitTask {
  id: string;
  type: "shape-split";
  title: string;
  durationSec: number;
  /** Sprite ref for background shape, e.g. "sprite:#sticker-shapes-heart" */
  backgroundSvg?: string;
  /** Polygon vertices (viewBox-local coords, typically 0-200) */
  polygon: Array<{x: number; y: number}>;
  /** Target fraction 0-1 for the smaller side */
  targetFraction: number;
}

export interface TextAnswerTask {
  id: string;
  type: "text-answer";
  title: string;
  durationSec: number;
  /** Round 2 voting question shown when comparing two answers */
  voteQuestion: string;
}

export interface ThesisTask {
  id: string;
  type: "thesis";
  title: string;
  durationSec: number;
}

export type MinigameTask =
  | StickerPlaceTask
  | DrawingTask
  | ChoiceTask
  | NumberTask
  | TimerStopTask
  | ShapeSplitTask
  | TextAnswerTask
  | ThesisTask;

// ── Config ──────────────────────────────────────────────────────

export interface MinigameConfig {
  tasks: MinigameTask[];
}

export function parseMinigameConfig(raw: unknown): MinigameConfig {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const tasks: MinigameTask[] = [];
  if (Array.isArray(r["tasks"])) {
    for (const t of r["tasks"] as unknown[]) {
      const task = parseTask(t);
      if (task) tasks.push(task);
    }
  }
  return {tasks};
}

function parseTask(raw: unknown): MinigameTask | null {
  const t = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const type = t["type"];
  const id = typeof t["id"] === "string" && t["id"] ? t["id"] : crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
  const title = typeof t["title"] === "string" ? t["title"] : "";
  const dur = typeof t["durationSec"] === "number" ? t["durationSec"] : 60;

  switch (type) {
    case "sticker-place": {
      const goalRaw = t["goal"];
      const goal: StickerPlaceGoal | undefined =
        goalRaw === "closest-to-average" || goalRaw === "furthest-from-average" ? goalRaw : undefined;
      // Backward compat: single stickerSvg string → array, or new stickerSvgs array
      const svgs = Array.isArray(t["stickerSvgs"])
        ? (t["stickerSvgs"] as unknown[]).filter((s): s is string => typeof s === "string")
        : typeof t["stickerSvg"] === "string" ? [t["stickerSvg"]] : ["sticker-shapes-heart"];
      return {
        id, type: "sticker-place", title, durationSec: dur,
        stickerSvgs: svgs,
        backgroundSvg: typeof t["backgroundSvg"] === "string" ? t["backgroundSvg"] : undefined,
        goal,
      };
    }
    case "drawing": return {
      id, type: "drawing", title, durationSec: dur,
      backgroundSvg: typeof t["backgroundSvg"] === "string" ? t["backgroundSvg"] : undefined,
      extraTasks: Array.isArray(t["extraTasks"])
        ? (t["extraTasks"] as unknown[]).filter((e): e is string => typeof e === "string" && e.length > 0)
        : undefined,
    };
    case "choice": return {
      id, type: "choice", title, durationSec: dur,
      options: Array.isArray(t["options"])
        ? (t["options"] as unknown[]).map((o: any) => ({label: String(o?.label ?? ""), emoji: typeof o?.emoji === "string" ? o.emoji : undefined}))
        : [],
    };
    case "number": return {
      id, type: "number", title, durationSec: dur,
      min: typeof t["min"] === "number" ? t["min"] : 1,
      max: typeof t["max"] === "number" ? t["max"] : 100,
      default: typeof t["default"] === "number" ? t["default"] : 50,
    };
    case "timer-stop": return {
      id, type: "timer-stop", title, durationSec: dur,
      targetSec: typeof t["targetSec"] === "number" ? t["targetSec"] : 5,
    };
    case "shape-split": return {
      id, type: "shape-split", title, durationSec: dur,
      backgroundSvg: typeof t["backgroundSvg"] === "string" ? t["backgroundSvg"] : undefined,
      polygon: Array.isArray(t["polygon"])
        ? (t["polygon"] as unknown[]).filter((p: any) => typeof p?.x === "number" && typeof p?.y === "number").map((p: any) => ({x: p.x, y: p.y}))
        : [{x: 20, y: 20}, {x: 180, y: 20}, {x: 180, y: 180}, {x: 20, y: 180}],
      targetFraction: typeof t["targetFraction"] === "number" ? Math.max(0, Math.min(1, t["targetFraction"])) : 0.5,
    };
    case "text-answer": return {
      id, type: "text-answer", title, durationSec: dur,
      voteQuestion: typeof t["voteQuestion"] === "string" ? t["voteQuestion"] : "",
    };
    case "thesis": return {
      id, type: "thesis", title, durationSec: dur,
    };
    default: return null;
  }
}

// ── Submissions ─────────────────────────────────────────────────

export interface StickerPlaceSubmission {
  type: "sticker-place";
  playerId: string;
  roundIndex: number;
  /** Positions for each placed sticker */
  positions: Array<{stickerId: string; x: number; y: number}>;
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
  cutLine: {a: {x: number; y: number}; b: {x: number; y: number}};
  areaFraction: number;
  submittedAt: number;
}

export interface TextAnswerSubmission {
  type: "text-answer";
  playerId: string;
  roundIndex: number;
  answer: string;
  submittedAt: number;
}

export interface ThesisSubmission {
  type: "thesis";
  playerId: string;
  roundIndex: number;
  agreed: boolean;
  estimatedPercent: number;
  submittedAt: number;
}

export type MinigameSubmission =
  | StickerPlaceSubmission
  | DrawingSubmission
  | ChoiceSubmission
  | NumberSubmission
  | TimerStopSubmission
  | ShapeSplitSubmission
  | TextAnswerSubmission
  | ThesisSubmission;

// ── Client Actions ──────────────────────────────────────────────

export type MinigameClientAction =
  | { type: "submit-sticker-place"; positions: Array<{stickerId: string; x: number; y: number}> }
  | { type: "submit-drawing"; imageDataUrl: string }
  | { type: "submit-choice"; selectedIndices: number[] }
  | { type: "submit-number"; value: number }
  | { type: "submit-timer"; elapsedSec: number }
  | { type: "submit-shape-split"; cutLine: {a: {x: number; y: number}; b: {x: number; y: number}}; areaFraction: number }
  | { type: "submit-text-answer"; answer: string }
  | { type: "submit-thesis"; agreed: boolean; estimatedPercent: number }
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

