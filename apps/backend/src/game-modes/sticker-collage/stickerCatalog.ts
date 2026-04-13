import type {StickerDefinition, StickerCollageGameConfig, StickerHand, StickerPack} from "@birthday/shared";

/**
 * Default sticker catalog.
 * Each sticker has an id, imageUrl, categories, and a packId linking it to a pack.
 */
export const DEFAULT_STICKER_CATALOG: StickerDefinition[] = [
    // ── Pack: Augen ──────────────────────────
    {id: "eyes_round",      imageUrl: "assets/png/sticker_eye_round.png",      categories: ["eyes"], packId: "pack_eyes"},
    {id: "eyes_cute",       imageUrl: "assets/png/sticker_eye_cute.png",       categories: ["eyes"], packId: "pack_eyes"},
    {id: "eyes_angry",      imageUrl: "assets/png/sticker_eye_angry.png",      categories: ["eyes"], packId: "pack_eyes"},
    {id: "eyes_sleepy",     imageUrl: "assets/png/sticker_eye_sleepy.png",     categories: ["eyes"], packId: "pack_eyes"},
    {id: "eyes_star",       imageUrl: "assets/png/sticker_eye_star.png",       categories: ["eyes"], packId: "pack_eyes"},
    {id: "eyes_heart",      imageUrl: "assets/png/sticker_eye_heart.png",      categories: ["eyes"], packId: "pack_eyes",
        hitboxPolygon: [{x:0.5,y:0},{x:0.62,y:0.38},{x:1,y:0.38},{x:0.69,y:0.6},{x:0.81,y:1},{x:0.5,y:0.75},{x:0.19,y:1},{x:0.31,y:0.6},{x:0,y:0.38},{x:0.38,y:0.38}]},

    // ── Pack: Münder ─────────────────────────
    {id: "mouth_smile",     imageUrl: "assets/png/sticker_mouth_smile.png",     categories: ["mouth"], packId: "pack_mouths"},
    {id: "mouth_open",      imageUrl: "assets/png/sticker_mouth_open.png",      categories: ["mouth"], packId: "pack_mouths"},
    {id: "mouth_teeth",     imageUrl: "assets/png/sticker_mouth_teeth.png",     categories: ["mouth"], packId: "pack_mouths"},
    {id: "mouth_tongue",    imageUrl: "assets/png/sticker_mouth_tongue.png",    categories: ["mouth"], packId: "pack_mouths"},

    // ── Pack: Nasen ──────────────────────────
    {id: "nose_round",      imageUrl: "assets/png/sticker_nose_round.png",      categories: ["nose"], packId: "pack_noses"},
    {id: "nose_pointy",     imageUrl: "assets/png/sticker_nose_pointy.png",     categories: ["nose"], packId: "pack_noses", hitboxPolygon: [{x:0.5,y:0},{x:1,y:1},{x:0,y:1}]},
    {id: "nose_clown",      imageUrl: "assets/png/sticker_nose_clown.png",      categories: ["nose"], packId: "pack_noses"},

    // ── Pack: Formen ─────────────────────────
    {id: "shape_circle",    imageUrl: "assets/png/sticker_shape_circle.png",    categories: ["shape"], packId: "pack_shapes"},
    {id: "shape_square",    imageUrl: "assets/png/sticker_shape_square.png",    categories: ["shape"], packId: "pack_shapes"},
    {id: "shape_triangle",  imageUrl: "assets/png/sticker_shape_triangle.png",  categories: ["shape"], packId: "pack_shapes", hitboxPolygon: [{x:0.5,y:0},{x:1,y:1},{x:0,y:1}]},
    {id: "shape_star",      imageUrl: "assets/png/sticker_shape_star.png",      categories: ["shape"], packId: "pack_shapes", hitboxPolygon: [{x:0.5,y:0},{x:0.62,y:0.38},{x:1,y:0.38},{x:0.69,y:0.6},{x:0.81,y:1},{x:0.5,y:0.75},{x:0.19,y:1},{x:0.31,y:0.6},{x:0,y:0.38},{x:0.38,y:0.38}]},
    {id: "shape_blob",      imageUrl: "assets/png/sticker_shape_blob.png",      categories: ["shape"], packId: "pack_shapes"},
    {id: "shape_cloud",     imageUrl: "assets/png/sticker_shape_cloud.png",     categories: ["shape"], packId: "pack_shapes"},

    // ── Pack: Früchte ────────────────────────
    {id: "fruit_apple",     imageUrl: "assets/png/sticker_fruit_apple.png",     categories: ["fruit", "food"], packId: "pack_fruits"},
    {id: "fruit_banana",    imageUrl: "assets/png/sticker_fruit_banana.png",    categories: ["fruit", "food"], packId: "pack_fruits"},
    {id: "fruit_cherry",    imageUrl: "assets/png/sticker_fruit_cherry.png",    categories: ["fruit", "food"], packId: "pack_fruits"},
    {id: "fruit_strawberry",imageUrl: "assets/png/sticker_fruit_strawberry.png",categories: ["fruit", "food"], packId: "pack_fruits"},

    // ── Pack: Accessoires ────────────────────
    {id: "acc_hat",         imageUrl: "assets/png/sticker_acc_hat.png",         categories: ["accessory"], packId: "pack_accessories"},
    {id: "acc_crown",       imageUrl: "assets/png/sticker_acc_crown.png",       categories: ["accessory"], packId: "pack_accessories",
        hitboxPolygon: [{x:0.1,y:1},{x:0,y:0.4},{x:0.25,y:0.7},{x:0.5,y:0},{x:0.75,y:0.7},{x:1,y:0.4},{x:0.9,y:1}]},
    {id: "acc_glasses",     imageUrl: "assets/png/sticker_acc_glasses.png",     categories: ["accessory"], packId: "pack_accessories"},
    {id: "acc_bowtie",      imageUrl: "assets/png/sticker_acc_bowtie.png",      categories: ["accessory"], packId: "pack_accessories",
        hitboxPolygon: [{x:0.5,y:0.3},{x:1,y:0},{x:1,y:1},{x:0.5,y:0.7},{x:0,y:1},{x:0,y:0}]},
];

/**
 * Default sticker pack definitions.
 * Packs marked with unlockedAtStart: true are available from round 1.
 * Others must be unlocked by round winners.
 */
export const DEFAULT_STICKER_PACKS: StickerPack[] = [
    {
        id: "pack_eyes",
        name: "👀 Augen",
        stickerIds: DEFAULT_STICKER_CATALOG.filter(s => s.packId === "pack_eyes").map(s => s.id),
        unlockedAtStart: true,
    },
    {
        id: "pack_mouths",
        name: "👄 Münder",
        stickerIds: DEFAULT_STICKER_CATALOG.filter(s => s.packId === "pack_mouths").map(s => s.id),
        unlockedAtStart: true,
    },
    {
        id: "pack_noses",
        name: "👃 Nasen",
        stickerIds: DEFAULT_STICKER_CATALOG.filter(s => s.packId === "pack_noses").map(s => s.id),
        unlockedAtStart: true,
    },
    {
        id: "pack_shapes",
        name: "🔷 Formen",
        stickerIds: DEFAULT_STICKER_CATALOG.filter(s => s.packId === "pack_shapes").map(s => s.id),
        unlockedAtStart: false,
    },
    {
        id: "pack_fruits",
        name: "🍎 Früchte",
        stickerIds: DEFAULT_STICKER_CATALOG.filter(s => s.packId === "pack_fruits").map(s => s.id),
        unlockedAtStart: false,
    },
    {
        id: "pack_accessories",
        name: "🎩 Accessoires",
        stickerIds: DEFAULT_STICKER_CATALOG.filter(s => s.packId === "pack_accessories").map(s => s.id),
        unlockedAtStart: false,
    },
];

/**
 * Get the set of sticker IDs available given the currently unlocked packs.
 */
export function getAvailableStickerIds(
    packs: StickerPack[],
    unlockedPackIds: string[],
): Set<string> {
    const ids = new Set<string>();
    for (const pack of packs) {
        if (unlockedPackIds.includes(pack.id)) {
            for (const sid of pack.stickerIds) {
                ids.add(sid);
            }
        }
    }
    return ids;
}

/**
 * Deal a random hand of stickers to a player.
 * Only stickers from unlocked packs are available.
 * If guaranteedPackId is set, at least one sticker from that pack is included.
 */
export function dealHand(
    catalog: StickerDefinition[],
    config: StickerCollageGameConfig,
    unlockedPackIds?: string[],
    guaranteedPackId?: string | null,
    allPacks?: StickerPack[],
): StickerHand {
    const handSize = config.handSize;
    const requiredCategories = config.requiredCategories;

    // Filter catalog to only unlocked stickers
    let availableCatalog = catalog;
    if (unlockedPackIds && allPacks) {
        const availableIds = getAvailableStickerIds(allPacks, unlockedPackIds);
        availableCatalog = catalog.filter(s => availableIds.has(s.id));
    }

    // Fallback: if filtering leaves too few stickers, use full catalog
    if (availableCatalog.length < handSize) {
        availableCatalog = catalog;
    }

    const selected: StickerDefinition[] = [];
    const usedIds = new Set<string>();

    // 1. Satisfy guaranteed pack first (if set)
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

    // 2. Satisfy required categories
    for (const cat of requiredCategories) {
        const candidates = availableCatalog.filter(s => s.categories.includes(cat) && !usedIds.has(s.id));
        if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            selected.push(pick);
            usedIds.add(pick.id);
        }
    }

    // 3. Fill the rest randomly
    const remaining = availableCatalog.filter(s => !usedIds.has(s.id));
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);

    for (const sticker of shuffled) {
        if (selected.length >= handSize) break;
        selected.push(sticker);
        usedIds.add(sticker.id);
    }

    // Shuffle the final hand so guaranteed/required stickers aren't always first
    const finalHand = [...selected].sort(() => Math.random() - 0.5);

    return {
        stickerIds: finalHand.map(s => s.id),
    };
}
