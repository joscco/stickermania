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
    let availablePacks = allPacks ?? [];
    if (unlockedPackIds && allPacks) {
        const availableIds = getAvailableStickerIds(allPacks, unlockedPackIds);
        availableCatalog = catalog.filter(s => availableIds.has(s.id));
        availablePacks = allPacks.filter(p => unlockedPackIds.includes(p.id));
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

    // 2. Group available stickers by pack and shuffle each pack
    const byPack = new Map<string, StickerDefinition[]>();
    for (const s of availableCatalog) {
        if (usedIds.has(s.id)) continue;
        const packId = s.packId ?? '';
        if (!byPack.has(packId)) byPack.set(packId, []);
        byPack.get(packId)!.push(s);
    }
    for (const stickers of byPack.values()) {
        stickers.sort(() => Math.random() - 0.5);
    }

    // 3. Round-robin through packs to fill hand
    const packIds = [...byPack.keys()].sort(() => Math.random() - 0.5);
    const indices = new Map<string, number>();
    for (const pid of packIds) indices.set(pid, 0);

    while (selected.length < handSize) {
        let added = false;
        for (const pid of packIds) {
            const stickers = byPack.get(pid)!;
            const idx = indices.get(pid)!;
            if (idx < stickers.length) {
                selected.push(stickers[idx]);
                usedIds.add(stickers[idx].id);
                indices.set(pid, idx + 1);
                added = true;
                if (selected.length >= handSize) break;
            }
        }
        if (!added) break;
    }

    return {stickerIds: [...selected].sort(() => Math.random() - 0.5).map(s => s.id)};
}
