import type {
    BoardStickerPlacement,
    GameConfig,
    SessionPlayer,
    SessionState,
    StickerCatalogConfig,
    StickerCollageGameState,
    StickerConfigEntry,
    StickerDefinition,
    StickerPack,
} from "./index.js";
import {STICKERMANIA_CONFIG} from "./stickermaniaConfig.js";

function stickerId(entry: StickerConfigEntry): string {
    return typeof entry === "string" ? entry : entry.id;
}

function stickerImageUrl(entry: StickerConfigEntry): string {
    return typeof entry === "string" ? `sprite:#sticker-${entry}` : entry.imageUrl;
}

function stickerName(entry: StickerConfigEntry): string | undefined {
    return typeof entry === "string" ? undefined : entry.name;
}

function stickerEditorData(entry: StickerConfigEntry): StickerDefinition["editorData"] {
    return typeof entry === "string" ? undefined : entry.editorData;
}

export function buildStickerCatalog(config: StickerCatalogConfig): StickerDefinition[] {
    const definitions: StickerDefinition[] = [];
    const seen = new Set<string>();
    for (const pack of config.packs) {
        for (const sticker of pack.stickers ?? []) {
            const id = stickerId(sticker);
            if (!seen.has(id)) {
                seen.add(id);
                definitions.push({
                    id,
                    name: stickerName(sticker),
                    imageUrl: stickerImageUrl(sticker),
                    packId: pack.id,
                    ...(stickerEditorData(sticker) ? {editorData: stickerEditorData(sticker)} : {}),
                });
            }
        }
    }
    return definitions;
}

export function buildStickerPacks(config: StickerCatalogConfig): StickerPack[] {
    return config.packs.map(packCfg => ({
        id: packCfg.id,
        name: packCfg.name,
        iconId: packCfg.iconId,
        stickerIds: (packCfg.stickers ?? []).map(stickerId),
    }));
}

export function createInitialStickerCollageState(config: GameConfig): StickerCollageGameState {
    return {
        stickerCatalog: buildStickerCatalog(config.stickerCollage.catalog),
        stickerPacks: buildStickerPacks(config.stickerCollage.catalog),
        playerStickers: {},
        boardPlacements: [],
    };
}

export function createEmptySessionState(args: {
    config: GameConfig;
    sessionId: string;
    sessionCode: string;
    now?: number;
}): SessionState {
    const now = args.now ?? Date.now();

    return {
        sessionId: args.sessionId,
        sessionCode: args.sessionCode,
        players: {},
        gameState: createInitialStickerCollageState(args.config),
        revision: 0,
        updatedAt: now,
        createdAt: now,
        expiresAt: now + args.config.sessionTtlHours * 60 * 60 * 1000,
    };
}

export function createSessionPlayer(args: {
    playerId: string;
    now?: number;
    isHost: boolean;
}): SessionPlayer {
    const now = args.now ?? Date.now();

    return {
        id: args.playerId,
        name: "",
        avatarUrl: null,
        avatarAssetPath: null,
        score: 0,
        joinedAt: now,
        connected: true,
        isHost: args.isHost,
        teamId: null,
    };
}

export function normalizeBoardZIndexes(placements: BoardStickerPlacement[]): BoardStickerPlacement[] {
    return placements
        .map((placement, order) => ({placement, order}))
        .sort((left, right) => left.placement.zIndex - right.placement.zIndex || left.order - right.order)
        .map(({placement}, index) => placement.zIndex === index + 1 ? placement : {...placement, zIndex: index + 1});
}

export function defaultPlayerPackId(playerId: string): string {
    return `player-${playerId}`;
}

export function playerDefaultPackName(playerName?: string): string {
    const trimmed = playerName?.trim();
    return trimmed ? trimmed : "Spieler-Sticker";
}

export function ensurePlayerDefaultStickerPack(
    gameState: StickerCollageGameState,
    playerId: string,
    playerName?: string,
): StickerPack {
    gameState.stickerPacks ??= [];
    const packId = defaultPlayerPackId(playerId);
    const existing = gameState.stickerPacks.find(pack => pack.id === packId);
    if (existing) {
        existing.ownerPlayerId = playerId;
        existing.name = playerDefaultPackName(playerName);
        existing.stickerIds ??= [];
        return existing;
    }

    const created: StickerPack = {
        id: packId,
        name: playerDefaultPackName(playerName),
        ownerPlayerId: playerId,
        createdAt: undefined,
        stickerIds: [],
    };
    gameState.stickerPacks.push(created);
    return created;
}

export function ensurePlayerStickerPack(
    gameState: StickerCollageGameState,
    playerId: string,
    requestedPackId: string | undefined,
    playerName?: string,
): StickerPack {
    const fallback = ensurePlayerDefaultStickerPack(gameState, playerId, playerName);
    if (!requestedPackId || requestedPackId === fallback.id) {
        return fallback;
    }

    const requestedPack = gameState.stickerPacks.find(pack => pack.id === requestedPackId);
    if (!requestedPack || requestedPack.ownerPlayerId !== playerId) {
        return fallback;
    }

    requestedPack.stickerIds ??= [];
    return requestedPack;
}

export function addStickerToPlayerPack(
    gameState: StickerCollageGameState,
    sticker: {id: string; ownerPlayerId: string; packId?: string},
    playerName?: string,
): string {
    const pack = ensurePlayerStickerPack(gameState, sticker.ownerPlayerId, sticker.packId, playerName);
    for (const existingPack of gameState.stickerPacks) {
        existingPack.stickerIds = (existingPack.stickerIds ?? []).filter(stickerId => stickerId !== sticker.id);
    }
    pack.stickerIds = [...pack.stickerIds.filter(stickerId => stickerId !== sticker.id), sticker.id];
    return pack.id;
}

export function removeStickerFromPlayerPacks(gameState: StickerCollageGameState, stickerId: string): void {
    gameState.stickerPacks ??= [];
    for (const pack of gameState.stickerPacks) {
        pack.stickerIds = (pack.stickerIds ?? []).filter(existingId => existingId !== stickerId);
    }
}

export function createPlayerStickerPack(args: {
    gameState: StickerCollageGameState;
    playerId: string;
    name: string;
    now: number;
    randomSuffix?: string;
}): StickerPack {
    args.gameState.stickerPacks ??= [];
    const safeName = normalizePackName(args.name);
    const pack: StickerPack = {
        id: `player-${args.playerId}-${args.now.toString(36)}-${args.randomSuffix ?? Math.random().toString(36).slice(2, 7)}`,
        name: safeName,
        ownerPlayerId: args.playerId,
        createdAt: args.now,
        stickerIds: [],
    };
    args.gameState.stickerPacks.push(pack);
    return pack;
}

export function normalizePackName(name: string): string {
    const trimmed = name.trim().replace(/\s+/g, " ").slice(0, STICKERMANIA_CONFIG.stickerPacks.maxNameLength);
    return trimmed || "Neues Pack";
}

export function touchSessionState(state: SessionState, now: number = Date.now()): SessionState {
    state.revision += 1;
    state.updatedAt = now;
    return state;
}
