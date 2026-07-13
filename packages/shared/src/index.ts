export {DEFAULT_STICKER_CATALOG} from "./defaultStickerCatalogData.js";
export {DEFAULT_GAME_CONFIG, createGameConfig, STICKERMANIA_CONFIG, type StickermaniaAppConfig} from "./stickermaniaConfig.js";
export {
    addStickerToPlayerPack,
    buildStickerCatalog,
    buildStickerPacks,
    createEmptySessionState,
    createInitialStickerCollageState,
    createPlayerStickerPack,
    createSessionPlayer,
    defaultPlayerPackId,
    ensurePlayerDefaultStickerPack,
    ensurePlayerStickerPack,
    normalizeBoardZIndexes,
    normalizePackName,
    playerDefaultPackName,
    removeStickerFromPlayerPacks,
    touchSessionState,
} from "./sessionState.js";

// ─── Config types ────────────────────────────────────────────────

export interface StickerDefinitionConfig {
    id: string;
    imageUrl: string;
    name?: string;
    editorData?: StickerEditorData;
}

export type StickerConfigEntry = string | StickerDefinitionConfig;

export interface StickerPackConfig {
    id: string;
    name: string;
    /** Sprite symbol id for the pack icon, e.g. "pack-icon-shape" */
    iconId?: string;
    stickers: StickerConfigEntry[];
}

export interface StickerCatalogConfig {
    packs: StickerPackConfig[];
}

export interface StickerCollageGameConfig {
    catalog: StickerCatalogConfig;
}

export interface GameConfig {
    port: number;
    adminPassword: string | null;
    sessionTtlHours: number;
    stickerCollage: StickerCollageGameConfig;
}

export interface StickerBoardBoundsConfig {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
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
    | { type: "submit-user-data"; name: string; avatarDataUrl?: string | null }
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
    ownerPlayerId?: string;
    createdAt?: number;
    stickerIds: string[];
}

export interface StickerEditorTextBox {
    text: string;
    x: number;
    y: number;
    boxWidth: number;
    boxHeight: number;
    fontSize: number;
    lineHeight?: number;
    color: string;
    align: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
}

export interface StickerEditorData {
    version: 2;
    baseImageUrl: string;
    paintImageUrl: string;
    baseImageAssetPath?: string;
    paintImageAssetPath?: string;
    workspace: {
        width: number;
        height: number;
    };
    outlineWidth: number;
    textBox?: StickerEditorTextBox;
}

export interface StickerEditorUpload {
    version: 2;
    baseImageDataUrl: string;
    paintImageDataUrl: string;
    workspace: {
        width: number;
        height: number;
    };
    outlineWidth: number;
    textBox?: StickerEditorTextBox;
}

export interface StickerDefinition {
    id: string;
    name?: string;
    imageUrl: string;
    packId?: string;
    ownerPlayerId?: string;
    createdAt?: number;
    /**
     * Optional overlay bounds for the selection box.
     * {x, y} = center position, {w, h} = size, all normalized 0–1.
     * Falls back to the full rendered sticker bounds if absent.
     */
    overlayBounds?: { x: number; y: number; w: number; h: number };
    editorData?: StickerEditorData;
}

export interface StickerPlacement {
    instanceId: string;
    stickerId: string;
    ownerPlayerId?: string;
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

// ─── Phase state ──────────────────────────────────────────────

export interface PlayerSticker {
    id: string;
    name?: string;
    ownerPlayerId: string;
    imageUrl: string;
    assetPath: string;
    createdAt: number;
    packId?: string;
    overlayBounds?: { x: number; y: number; w: number; h: number };
    editorData?: StickerEditorData;
}

export interface StickerAssetManifestEntry {
    id: string;
    imageUrl: string;
    kind: "default" | "player";
    ownerPlayerId?: string;
    createdAt?: number;
}

export interface StickerAssetManifest {
    sessionId: string;
    revision: number;
    stickers: StickerAssetManifestEntry[];
}

export interface BoardStickerPlacement extends StickerPlacement {
    ownerPlayerId: string;
    placedByPlayerId: string;
    updatedAt: number;
}

// ─── Game state ───────────────────────────────────────────────

export interface StickerCollageGameState {
    stickerCatalog: StickerDefinition[];
    stickerPacks: StickerPack[];
    playerStickers: Record<string, PlayerSticker[]>;
    boardPlacements: BoardStickerPlacement[];
}

export type StickerCollageClientAction =
    | { type: "upsert-board-placements"; placements: BoardStickerPlacement[] }
    | { type: "delete-board-placements"; instanceIds: string[] };

export type StickerCollageServerEvent =
    | { type: "sticker-created"; playerId: string; stickerId: string; sticker: PlayerSticker }
    | { type: "sticker-deleted"; playerId: string; stickerId: string }
    | { type: "board-updated"; playerId: string };

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
