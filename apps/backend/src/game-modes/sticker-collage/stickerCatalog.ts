import type {StickerDefinition, StickerPack, StickerHand, StickerCollageGameConfig, StickerCatalogConfig} from "@birthday/shared";

/**
 * Builds the runtime StickerDefinition array from the catalog config.
 *
 * imageUrl is auto-derived as "sprite:#sticker-<id>" unless explicitly
 * overridden via the optional `imageUrl` field in the config entry.
 */
export function buildCatalog(config: StickerCatalogConfig): StickerDefinition[] {
    return config.stickers.map(entry => ({
        id:             entry.id,
        imageUrl:       entry.imageUrl ?? `sprite:#sticker-${entry.id}`,
        categories:     entry.categories,
        packId:         entry.packId,
        hitboxPolygon:  entry.hitboxPolygon,
    }));
}

/**
 * Builds the runtime StickerPack array from the catalog config.
 * The pack's stickerIds are derived from the sticker list — no duplication needed.
 */
export function buildPacks(config: StickerCatalogConfig): StickerPack[] {
    return config.packs.map(packCfg => ({
        id:             packCfg.id,
        name:           packCfg.name,
        iconId:         packCfg.iconId,
        stickerIds:     config.stickers.filter(s => s.packId === packCfg.id).map(s => s.id),
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
    const requiredCategories = config.requiredCategories;

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

    // 2. Required categories
    for (const cat of requiredCategories) {
        const candidates = availableCatalog.filter(s => s.categories.includes(cat) && !usedIds.has(s.id));
        if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            selected.push(pick);
            usedIds.add(pick.id);
        }
    }

    // 3. Fill rest randomly
    const shuffled = availableCatalog.filter(s => !usedIds.has(s.id)).sort(() => Math.random() - 0.5);
    for (const sticker of shuffled) {
        if (selected.length >= handSize) break;
        selected.push(sticker);
    }

    return {stickerIds: [...selected].sort(() => Math.random() - 0.5).map(s => s.id)};
}
