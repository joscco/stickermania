import type {GardenInventoryItem, GardenModeState} from "@birthday/shared";

/**
 * Get an existing inventory entry or create a new empty one.
 */
export function getOrCreateInventoryItem(modeState: GardenModeState, plantId: string): GardenInventoryItem {
    const existing = modeState.inventory[plantId];
    if (existing) return existing;

    const created: GardenInventoryItem = {
        plantId,
        seeds: 0,
        harvestedGoods: 0,
    };

    modeState.inventory[plantId] = created;
    return created;
}

/**
 * Calculate the garden level from total experience points.
 */
export function calculateLevel(experiencePoints: number): number {
    return 1 + Math.floor(experiencePoints / 25);
}

