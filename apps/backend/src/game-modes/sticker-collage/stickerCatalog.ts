import type {StickerDefinition, StickerPack, StickerHand, StickerCollageGameConfig, StickerCatalogConfig} from "@birthday/shared";

/**
 * Builds the runtime StickerDefinition array from the catalog config.
 */
export function buildCatalog(config: StickerCatalogConfig): StickerDefinition[] {
    const definitions: StickerDefinition[] = [];
    const seen = new Set<string>();
    for (const pack of config.packs) {
        for (const stickerId of pack.stickers ?? []) {
            if (!seen.has(stickerId)) {
                seen.add(stickerId);
                definitions.push({
                    id:       stickerId,
                    imageUrl: `sprite:#sticker-${stickerId}`,
                    packId:   pack.id,
                });
            }
        }
    }
    return definitions;
}

/**
 * Builds the runtime StickerPack array from the catalog config.
 */
export function buildPacks(config: StickerCatalogConfig): StickerPack[] {
    return config.packs.map(packCfg => ({
        id:              packCfg.id,
        name:            packCfg.name,
        iconId:          packCfg.iconId,
        stickerIds:      packCfg.stickers ?? [],
        unlockedAtStart: packCfg.unlockedAtStart,
    }));
}

// ── Re-export helpers that are still used downstream ──────────────────────────

export function getAvailableStickerIds(
    packs: StickerPack[],
    unlockedPackIds: string[],
): Set<string> {
    const ids = new Set<string>();
    for (const pack of packs) {
        if (unlockedPackIds.includes(pack.id)) {
            for (const sid of pack.stickerIds) ids.add(sid);
        }
    }
    return ids;
}

export function dealHand(
    catalog: StickerDefinition[],
    config: StickerCollageGameConfig,
    unlockedPackIds?: string[],
    guaranteedPackId?: string | null,
    allPacks?: StickerPack[],
): StickerHand {
    const handSize = config.handSize;

    let availableCatalog = catalog;
    if (unlockedPackIds && allPacks) {
        const availableIds = getAvailableStickerIds(allPacks, unlockedPackIds);
        availableCatalog = catalog.filter(s => availableIds.has(s.id));
    }
    if (availableCatalog.length < handSize) availableCatalog = catalog;

    const selected: StickerDefinition[] = [];
    const usedIds = new Set<string>();

    // 1. Guaranteed pack
    if (guaranteedPackId && allPacks) {
        const pack = allPacks.find(p => p.id === guaranteedPackId);
        if (pack) {
            const candidates = availableCatalog.filter(s => pack.stickerIds.includes(s.id) && !usedIds.has(s.id));
            if (candidates.length > 0) {
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                selected.push(pick);
                usedIds.add(pick.id);
            }
        }
    }

    // 2. Fill rest randomly
    const shuffled = availableCatalog.filter(s => !usedIds.has(s.id)).sort(() => Math.random() - 0.5);
    for (const sticker of shuffled) {
        if (selected.length >= handSize) break;
        selected.push(sticker);
    }

    return {stickerIds: [...selected].sort(() => Math.random() - 0.5).map(s => s.id)};
}
