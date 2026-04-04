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
    {id: "eyes_round",      imageUrl: "assets/stickers/eyes_round.png",      categories: ["eyes"]},
    {id: "eyes_cute",       imageUrl: "assets/stickers/eyes_cute.png",       categories: ["eyes"]},
    {id: "eyes_angry",      imageUrl: "assets/stickers/eyes_angry.png",      categories: ["eyes"]},
    {id: "eyes_sleepy",     imageUrl: "assets/stickers/eyes_sleepy.png",     categories: ["eyes"]},
    {id: "eyes_star",       imageUrl: "assets/stickers/eyes_star.png",       categories: ["eyes"]},
    {id: "eyes_heart",      imageUrl: "assets/stickers/eyes_heart.png",      categories: ["eyes"]},

    // ── Mouths ───────────────────────────────
    {id: "mouth_smile",     imageUrl: "assets/stickers/mouth_smile.png",     categories: ["mouth"]},
    {id: "mouth_open",      imageUrl: "assets/stickers/mouth_open.png",      categories: ["mouth"]},
    {id: "mouth_teeth",     imageUrl: "assets/stickers/mouth_teeth.png",     categories: ["mouth"]},
    {id: "mouth_tongue",    imageUrl: "assets/stickers/mouth_tongue.png",    categories: ["mouth"]},

    // ── Noses ────────────────────────────────
    {id: "nose_round",      imageUrl: "assets/stickers/nose_round.png",      categories: ["nose"]},
    {id: "nose_pointy",     imageUrl: "assets/stickers/nose_pointy.png",     categories: ["nose"]},
    {id: "nose_clown",      imageUrl: "assets/stickers/nose_clown.png",      categories: ["nose"]},

    // ── Shapes ───────────────────────────────
    {id: "shape_circle",    imageUrl: "assets/stickers/shape_circle.png",    categories: ["shape"]},
    {id: "shape_square",    imageUrl: "assets/stickers/shape_square.png",    categories: ["shape"]},
    {id: "shape_triangle",  imageUrl: "assets/stickers/shape_triangle.png",  categories: ["shape"]},
    {id: "shape_star",      imageUrl: "assets/stickers/shape_star.png",      categories: ["shape"]},
    {id: "shape_blob",      imageUrl: "assets/stickers/shape_blob.png",      categories: ["shape"]},
    {id: "shape_cloud",     imageUrl: "assets/stickers/shape_cloud.png",     categories: ["shape"]},

    // ── Fruits ───────────────────────────────
    {id: "fruit_apple",     imageUrl: "assets/stickers/fruit_apple.png",     categories: ["fruit", "food"]},
    {id: "fruit_banana",    imageUrl: "assets/stickers/fruit_banana.png",    categories: ["fruit", "food"]},
    {id: "fruit_cherry",    imageUrl: "assets/stickers/fruit_cherry.png",    categories: ["fruit", "food"]},
    {id: "fruit_strawberry",imageUrl: "assets/stickers/fruit_strawberry.png",categories: ["fruit", "food"]},

    // ── Accessories ──────────────────────────
    {id: "acc_hat",         imageUrl: "assets/stickers/acc_hat.png",         categories: ["accessory"]},
    {id: "acc_crown",       imageUrl: "assets/stickers/acc_crown.png",       categories: ["accessory"]},
    {id: "acc_glasses",     imageUrl: "assets/stickers/acc_glasses.png",     categories: ["accessory"]},
    {id: "acc_bowtie",      imageUrl: "assets/stickers/acc_bowtie.png",      categories: ["accessory"]},
    {id: "acc_mustache",    imageUrl: "assets/stickers/acc_mustache.png",    categories: ["accessory"]},

    // ── Objects ──────────────────────────────
    {id: "obj_chair",       imageUrl: "assets/stickers/obj_chair.png",       categories: ["object"]},
    {id: "obj_lamp",        imageUrl: "assets/stickers/obj_lamp.png",        categories: ["object"]},
    {id: "obj_flower",      imageUrl: "assets/stickers/obj_flower.png",      categories: ["object", "nature"]},
    {id: "obj_tree",        imageUrl: "assets/stickers/obj_tree.png",        categories: ["object", "nature"]},
    {id: "obj_sun",         imageUrl: "assets/stickers/obj_sun.png",         categories: ["object", "nature"]},
    {id: "obj_moon",        imageUrl: "assets/stickers/obj_moon.png",        categories: ["object", "nature"]},

    // ── Body parts ───────────────────────────
    {id: "body_arm_left",   imageUrl: "assets/stickers/body_arm_left.png",   categories: ["body"]},
    {id: "body_arm_right",  imageUrl: "assets/stickers/body_arm_right.png",  categories: ["body"]},
    {id: "body_leg",        imageUrl: "assets/stickers/body_leg.png",        categories: ["body"]},
    {id: "body_hand",       imageUrl: "assets/stickers/body_hand.png",       categories: ["body"]},
    {id: "body_tail",       imageUrl: "assets/stickers/body_tail.png",       categories: ["body"]},
    {id: "body_wing",       imageUrl: "assets/stickers/body_wing.png",       categories: ["body"]},

    // ── Extras ───────────────────────────────
    {id: "extra_sparkle",   imageUrl: "assets/stickers/extra_sparkle.png",   categories: ["effect"]},
    {id: "extra_lightning",  imageUrl: "assets/stickers/extra_lightning.png", categories: ["effect"]},
    {id: "extra_heart",     imageUrl: "assets/stickers/extra_heart.png",     categories: ["effect"]},
    {id: "extra_fire",      imageUrl: "assets/stickers/extra_fire.png",      categories: ["effect"]},
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

