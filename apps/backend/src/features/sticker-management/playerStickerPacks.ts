import type {StickerCollageGameState} from "@birthday/shared";
import {
    addStickerToPlayerPack,
    createPlayerStickerPack,
    defaultPlayerPackId,
    ensurePlayerDefaultStickerPack,
    ensurePlayerStickerPack,
    normalizePackName,
    playerDefaultPackName,
    removeStickerFromPlayerPacks,
} from "@birthday/shared/sessionState";

export {
    addStickerToPlayerPack,
    createPlayerStickerPack,
    defaultPlayerPackId,
    ensurePlayerDefaultStickerPack,
    ensurePlayerStickerPack,
    normalizePackName,
    playerDefaultPackName,
    removeStickerFromPlayerPacks,
};

export function reconcilePlayerStickerPacks(
    gameState: StickerCollageGameState,
    players: Record<string, {name: string}>,
): boolean {
    gameState.playerStickers ??= {};
    gameState.stickerPacks ??= [];

    let changed = false;
    for (const [playerId, stickers] of Object.entries(gameState.playerStickers)) {
        const playerName = players[playerId]?.name;
        const hadDefaultPack = gameState.stickerPacks.some(pack => pack.id === defaultPlayerPackId(playerId));
        const defaultPack = ensurePlayerDefaultStickerPack(gameState, playerId, playerName);
        if (!hadDefaultPack) {
            changed = true;
        }
        const ownPackIds = new Set(
            gameState.stickerPacks
                .filter(pack => pack.ownerPlayerId === playerId || pack.id === defaultPack.id)
                .map(pack => pack.id),
        );

        for (const sticker of stickers) {
            const previousPackMembership = gameState.stickerPacks.map(pack => ({
                packId: pack.id,
                hasSticker: (pack.stickerIds ?? []).includes(sticker.id),
            }));
            const nextPackId = sticker.packId && ownPackIds.has(sticker.packId)
                ? sticker.packId
                : defaultPack.id;

            if (sticker.packId !== nextPackId) {
                sticker.packId = nextPackId;
                changed = true;
            }

            const assignedPackId = addStickerToPlayerPack(gameState, sticker, playerName);
            const packMembershipChanged = gameState.stickerPacks.some(pack => {
                const previous = previousPackMembership.find(item => item.packId === pack.id)?.hasSticker ?? false;
                return previous !== (pack.stickerIds ?? []).includes(sticker.id);
            });
            if (packMembershipChanged) {
                changed = true;
            }
            if (assignedPackId !== nextPackId) {
                sticker.packId = assignedPackId;
                changed = true;
            }

            const catalogSticker = gameState.stickerCatalog.find(definition => definition.id === sticker.id);
            if (catalogSticker && catalogSticker.packId !== sticker.packId) {
                catalogSticker.packId = sticker.packId;
                changed = true;
            }
        }
    }

    return changed;
}
