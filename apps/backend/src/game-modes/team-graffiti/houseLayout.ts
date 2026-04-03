import {type TeamGraffitiHouseType, TEAM_GRAFFITI_HOUSE_TYPES} from "@birthday/shared";

/** Logical city scene dimensions. */
export const SCENE_WIDTH = 4000;
export const SCENE_HEIGHT = 2000;
// Minimum distance between houses to avoid overlap and ensure good spacing. Center to center
const MIN_HOUSE_DISTANCE = 180;
// Margin to edges to avoid placing houses too close to the border
const HOUSE_MARGIN = 200;
const MAX_PLACEMENT_ATTEMPTS = 1200;
const TARGET_HOUSE_COUNT = 400;
const FLIP_THRESHOLD = 0.5;

// Constants for pseudo-random number generator.
// Leave as it is.

/** Seed for the deterministic pseudo-random number generator. */
const RNG_SEED = 42;

/** RNG multiplier (linear congruential generator). */
const RNG_MULTIPLIER = 1103515245;

/** RNG increment (linear congruential generator). */
const RNG_INCREMENT = 12345;

/** Bitmask to keep the RNG value within 31-bit range. */
const RNG_MASK = 0x7fffffff;


export interface HouseDef {
    houseType: TeamGraffitiHouseType;
    x: number;
    y: number;
    flipped: boolean;
}

/** Simple deterministic pseudo-random based on seed. */
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * RNG_MULTIPLIER + RNG_INCREMENT) & RNG_MASK;
        return (s >>> 0) / RNG_MASK;
    };
}

function generateHouseLayout(): HouseDef[] {
    const rng = seededRandom(RNG_SEED);
    const types = TEAM_GRAFFITI_HOUSE_TYPES;
    const houses: HouseDef[] = [];

    for (let i = 0; i < MAX_PLACEMENT_ATTEMPTS && houses.length < TARGET_HOUSE_COUNT; i++) {
        const x = Math.round(HOUSE_MARGIN + rng() * (SCENE_WIDTH - 2 * HOUSE_MARGIN));
        const y = Math.round(HOUSE_MARGIN + rng() * (SCENE_HEIGHT - 2 * HOUSE_MARGIN));

        let tooClose = false;
        for (const house of houses) {
            const dx = house.x - x;
            const dy = house.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < MIN_HOUSE_DISTANCE) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        houses.push({
            houseType: types[houses.length % types.length],
            x,
            y,
            flipped: rng() > FLIP_THRESHOLD,
        });
    }

    return houses;
}

export const HOUSE_LAYOUT: readonly HouseDef[] = generateHouseLayout();

