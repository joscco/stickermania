import type {PlayerSticker, SessionState, StickerPack} from "@stickermania/shared";
import {
    addStickerToPlayerPack,
    createPlayerStickerPack,
    ensurePlayerDefaultStickerPack,
    removeStickerFromPlayerPacks,
} from "./playerStickerPacks.js";
import type {SessionMutator} from "../session-management/sessionMutator.js";

export class PlayerStickerManager {
    public constructor(private readonly mutator: SessionMutator) {}

    public async addCreatedSticker(
        sessionId: string,
        playerId: string,
        sticker: PlayerSticker,
    ): Promise<SessionState | null> {
        const result = await this.mutator.mutate(sessionId, (state) => {
            if (!state.players[playerId] || sticker.ownerPlayerId !== playerId) {
                return {stateChanged: false, extra: undefined};
            }

            state.gameState.playerStickers ??= {};
            state.gameState.boardPlacements ??= [];
            state.gameState.stickerPacks ??= [];
            const playerName = state.players[playerId]?.name;
            const packId = addStickerToPlayerPack(state.gameState, sticker, playerName);
            const stickerWithPack: PlayerSticker = {...sticker, packId};

            this.upsertPlayerSticker(state, playerId, stickerWithPack);
            this.upsertCatalogSticker(state, playerId, stickerWithPack);

            return {
                stateChanged: true,
                publishState: false,
                gameEvents: [{type: "sticker-created", playerId, stickerId: sticker.id, sticker: stickerWithPack}],
                extra: undefined,
            };
        });

        return result?.state ?? null;
    }

    public async deleteSticker(
        sessionId: string,
        playerId: string,
        stickerId: string,
    ): Promise<{sticker: PlayerSticker; removedBoardPlacementCount: number} | null> {
        const result = await this.mutator.mutate<{sticker: PlayerSticker; removedBoardPlacementCount: number} | null>(sessionId, (state) => {
            state.gameState.playerStickers ??= {};
            state.gameState.boardPlacements ??= [];

            const playerStickers = state.gameState.playerStickers[playerId] ?? [];
            const deletedSticker = playerStickers.find(sticker => sticker.id === stickerId);

            if (!state.players[playerId] || !deletedSticker) {
                return {stateChanged: false, extra: null};
            }

            state.gameState.playerStickers[playerId] =
                playerStickers.filter(sticker => sticker.id !== stickerId);

            const previousBoardPlacementCount = state.gameState.boardPlacements.length;
            state.gameState.boardPlacements =
                state.gameState.boardPlacements.filter(placement => placement.stickerId !== stickerId);
            const removedBoardPlacementCount = previousBoardPlacementCount - state.gameState.boardPlacements.length;

            state.gameState.stickerCatalog =
                state.gameState.stickerCatalog.filter(definition => definition.id !== stickerId);
            removeStickerFromPlayerPacks(state.gameState, stickerId);

            return {
                stateChanged: true,
                gameEvents: [{type: "sticker-deleted", playerId, stickerId}],
                extra: {sticker: deletedSticker, removedBoardPlacementCount},
            };
        });

        return result?.extra ?? null;
    }

    public async moveStickerToPack(
        sessionId: string,
        playerId: string,
        stickerId: string,
        packId: string | undefined,
    ): Promise<PlayerSticker | null> {
        const result = await this.mutator.mutate<PlayerSticker | null>(sessionId, (state) => {
            const player = state.players[playerId];
            const playerStickers = state.gameState.playerStickers?.[playerId] ?? [];
            const sticker = playerStickers.find(item => item.id === stickerId);

            if (!player || !sticker) {
                return {stateChanged: false, extra: null};
            }

            sticker.packId = packId;
            const resolvedPackId = addStickerToPlayerPack(state.gameState, sticker, player.name);
            sticker.packId = resolvedPackId;

            const catalogSticker = state.gameState.stickerCatalog.find(definition => definition.id === stickerId);
            if (catalogSticker) {
                catalogSticker.packId = resolvedPackId;
            }

            return {stateChanged: true, extra: sticker};
        });

        return result?.extra ?? null;
    }

    public async createPlayerStickerPack(
        sessionId: string,
        playerId: string,
        name: string,
    ): Promise<StickerPack | null> {
        const result = await this.mutator.mutate<StickerPack | null>(sessionId, (state) => {
            const player = state.players[playerId];
            if (!player) {
                return {stateChanged: false, extra: null};
            }

            state.gameState.stickerPacks ??= [];
            ensurePlayerDefaultStickerPack(state.gameState, playerId, player.name);
            const pack = createPlayerStickerPack({
                gameState: state.gameState,
                playerId,
                name,
                now: Date.now(),
            });

            return {stateChanged: true, extra: pack};
        });

        return result?.extra ?? null;
    }

    public async deletePlayerStickerPack(
        sessionId: string,
        playerId: string,
        packId: string,
    ): Promise<StickerPack[] | null> {
        const result = await this.mutator.mutate<StickerPack[] | null>(sessionId, (state) => {
            const player = state.players[playerId];
            if (!player) {
                return {stateChanged: false, extra: null};
            }

            const defaultPack = ensurePlayerDefaultStickerPack(state.gameState, playerId, player.name);
            if (packId === defaultPack.id) {
                return {stateChanged: false, extra: null};
            }

            const pack = state.gameState.stickerPacks.find(item => item.id === packId);
            if (!pack || pack.ownerPlayerId !== playerId) {
                return {stateChanged: false, extra: null};
            }

            const movedStickerIds = new Set(pack.stickerIds ?? []);
            for (const sticker of state.gameState.playerStickers[playerId] ?? []) {
                if (sticker.packId === packId || movedStickerIds.has(sticker.id)) {
                    sticker.packId = defaultPack.id;
                    defaultPack.stickerIds = [...defaultPack.stickerIds.filter(id => id !== sticker.id), sticker.id];
                }
            }
            for (const definition of state.gameState.stickerCatalog) {
                if (movedStickerIds.has(definition.id) || definition.packId === packId) {
                    definition.packId = defaultPack.id;
                }
            }

            state.gameState.stickerPacks = state.gameState.stickerPacks
                .filter(item => item.id !== packId)
                .map(item => item.id === defaultPack.id
                    ? {...item, stickerIds: [...defaultPack.stickerIds]}
                    : {...item, stickerIds: (item.stickerIds ?? []).filter(id => !movedStickerIds.has(id))}
                );

            return {stateChanged: true, extra: state.gameState.stickerPacks};
        });

        return result?.extra ?? null;
    }

    private upsertPlayerSticker(state: SessionState, playerId: string, sticker: PlayerSticker): void {
        const playerStickers = state.gameState.playerStickers[playerId] ?? [];
        const existingIndex = playerStickers.findIndex(existingSticker => existingSticker.id === sticker.id);
        state.gameState.playerStickers[playerId] = existingIndex >= 0
            ? playerStickers.map(existingSticker => existingSticker.id === sticker.id ? sticker : existingSticker)
            : [...playerStickers, sticker];
    }

    private upsertCatalogSticker(state: SessionState, playerId: string, sticker: PlayerSticker): void {
        const catalogDefinition = {
            id: sticker.id,
            name: sticker.name,
            imageUrl: sticker.imageUrl,
            packId: sticker.packId,
            ownerPlayerId: playerId,
            createdAt: sticker.createdAt,
            ...(sticker.overlayBounds ? {overlayBounds: sticker.overlayBounds} : {}),
            ...(sticker.editorData ? {editorData: sticker.editorData} : {}),
        };
        const catalogIndex = state.gameState.stickerCatalog.findIndex(definition => definition.id === sticker.id);
        if (catalogIndex >= 0) {
            state.gameState.stickerCatalog[catalogIndex] = catalogDefinition;
            return;
        }

        state.gameState.stickerCatalog.push(catalogDefinition);
    }
}
