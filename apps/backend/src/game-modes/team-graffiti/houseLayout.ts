import type {TeamGraffitiHouseType} from "@birthday/shared";

/** Logical city scene dimensions. */
export const SCENE_WIDTH = 2000;
export const SCENE_HEIGHT = 1400;

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
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s >>> 0) / 0x7fffffff;
    };
}

function generateHouseLayout(): HouseDef[] {
    const rng = seededRandom(42);
    const types: TeamGraffitiHouseType[] = ["A", "B", "C"];
    const houses: HouseDef[] = [];

    const minDist = 220;
    const margin = 160;
    const attempts = 200;

    for (let i = 0; i < attempts && houses.length < 24; i++) {
        const x = Math.round(margin + rng() * (SCENE_WIDTH - 2 * margin));
        const y = Math.round(margin + rng() * (SCENE_HEIGHT - 2 * margin));

        let tooClose = false;
        for (const h of houses) {
            const dx = h.x - x;
            const dy = h.y - y;
            if (Math.sqrt(dx * dx + dy * dy) < minDist) {
                tooClose = true;
                break;
            }
        }
        if (tooClose) continue;

        houses.push({
            houseType: types[houses.length % types.length],
            x,
            y,
            flipped: rng() > 0.5,
        });
    }

    return houses;
}

export const HOUSE_LAYOUT: readonly HouseDef[] = generateHouseLayout();

