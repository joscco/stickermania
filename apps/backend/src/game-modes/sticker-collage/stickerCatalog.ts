import type {StickerDefinition, StickerPack, StickerCatalogConfig} from "@birthday/shared";

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


