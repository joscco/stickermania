import type {StickerDefinition, StickerCollageGameConfig, StickerHand} from "@birthday/shared";

/**
 * Default sticker catalog.
 * Each sticker has an id, an imageUrl (relative to sticker asset root), and categories (tags).
 *
 * In production the catalog could also be loaded from a JSON file; for now we keep a
 * built-in set of placeholder stickers. The actual PNG/SVG files will be placed in
 * apps/frontend/public/assets/stickers/ and served statically.
 */
export const DEFAULT_STICKER_CATALOG: StickerDefinition[] = [
    // ── Eyes ─────────────────────────────────
    {id: "eyes_round",      imageUrl: "assets/png/sticker_eye_round.png",      categories: ["eyes"]},
    {id: "eyes_cute",       imageUrl: "assets/png/sticker_eye_cute.png",       categories: ["eyes"]},
    {id: "eyes_angry",      imageUrl: "assets/png/sticker_eye_angry.png",      categories: ["eyes"]},
    {id: "eyes_sleepy",     imageUrl: "assets/png/sticker_eye_sleepy.png",     categories: ["eyes"]},
    {id: "eyes_star",       imageUrl: "assets/png/sticker_eye_star.png",       categories: ["eyes"]},
    {id: "eyes_heart",      imageUrl: "assets/png/sticker_eye_heart.png",      categories: ["eyes"]},

    // ── Mouths ───────────────────────────────
    {id: "mouth_smile",     imageUrl: "assets/png/sticker_mouth_smile.png",     categories: ["mouth"]},
    {id: "mouth_open",      imageUrl: "assets/png/sticker_mouth_open.png",      categories: ["mouth"]},
    {id: "mouth_teeth",     imageUrl: "assets/png/sticker_mouth_teeth.png",     categories: ["mouth"]},
    {id: "mouth_tongue",    imageUrl: "assets/png/sticker_mouth_tongue.png",    categories: ["mouth"]},

    // ── Noses ────────────────────────────────
    {id: "nose_round",      imageUrl: "assets/png/sticker_nose_round.png",      categories: ["nose"]},
    {id: "nose_pointy",     imageUrl: "assets/png/sticker_nose_pointy.png",     categories: ["nose"]},
    {id: "nose_clown",      imageUrl: "assets/png/sticker_nose_clown.png",      categories: ["nose"]},

    // ── Shapes ───────────────────────────────
    {id: "shape_circle",    imageUrl: "assets/png/sticker_shape_circle.png",    categories: ["shape"]},
    {id: "shape_square",    imageUrl: "assets/png/sticker_shape_square.png",    categories: ["shape"]},
    {id: "shape_triangle",  imageUrl: "assets/png/sticker_shape_triangle.png",  categories: ["shape"]},
    {id: "shape_star",      imageUrl: "assets/png/sticker_shape_star.png",      categories: ["shape"]},
    {id: "shape_blob",      imageUrl: "assets/png/sticker_shape_blob.png",      categories: ["shape"]},
    {id: "shape_cloud",     imageUrl: "assets/png/sticker_shape_cloud.png",     categories: ["shape"]},

    // ── Fruits ───────────────────────────────
    {id: "fruit_apple",     imageUrl: "assets/png/sticker_fruit_apple.png",     categories: ["fruit", "food"]},
    {id: "fruit_banana",    imageUrl: "assets/png/sticker_fruit_banana.png",    categories: ["fruit", "food"]},
    {id: "fruit_cherry",    imageUrl: "assets/png/sticker_fruit_cherry.png",    categories: ["fruit", "food"]},
    {id: "fruit_strawberry",imageUrl: "assets/png/sticker_fruit_strawberry.png",categories: ["fruit", "food"]},

    // ── Accessories ──────────────────────────
    {id: "acc_hat",         imageUrl: "assets/png/sticker_acc_hat.png",         categories: ["accessory"]},
    {id: "acc_crown",       imageUrl: "assets/png/sticker_acc_crown.png",       categories: ["accessory"]},
    {id: "acc_glasses",     imageUrl: "assets/png/sticker_acc_glasses.png",     categories: ["accessory"]},
    {id: "acc_bowtie",      imageUrl: "assets/png/sticker_acc_bowtie.png",      categories: ["accessory"]},

    // ── Objects ──────────────────────────────

    // ── Body parts ───────────────────────────

    // ── Extras ───────────────────────────────
];

/**
 * Deal a random hand of stickers to a player.
 * Ensures that for each required category, at least one sticker from that category is included.
 */
export function dealHand(
    catalog: StickerDefinition[],
    config: StickerCollageGameConfig,
): StickerHand {
    const handSize = config.handSize;
    const requiredCategories = config.requiredCategories;

    const selected: StickerDefinition[] = [];
    const usedIds = new Set<string>();

    // 1. Satisfy required categories first
    for (const cat of requiredCategories) {
        const candidates = catalog.filter(s => s.categories.includes(cat) && !usedIds.has(s.id));
        if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            selected.push(pick);
            usedIds.add(pick.id);
        }
    }

    // 2. Fill the rest randomly
    const remaining = catalog.filter(s => !usedIds.has(s.id));
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);

    for (const sticker of shuffled) {
        if (selected.length >= handSize) break;
        selected.push(sticker);
        usedIds.add(sticker.id);
    }

    // Shuffle the final hand so required stickers aren't always first
    const finalHand = [...selected].sort(() => Math.random() - 0.5);

    return {
        stickerIds: finalHand.map(s => s.id),
        swapsRemaining: config.swapCount,
    };
}

