import type {GardenPlantDefinition} from "@birthday/shared";

export const DEFAULT_GARDEN_PLANTS: readonly GardenPlantDefinition[] = [
    {
        id: "carrot",
        name: "Karotte",
        unlockLevel: 1,
        growthDurationSec: 120,
        waterIntervalSec: 45,
        harvestSeedYieldMin: 1,
        harvestSeedYieldMax: 2,
        harvestGoodsYieldMin: 1,
        harvestGoodsYieldMax: 2,
        experienceReward: 5,
    },
    {
        id: "strawberry",
        name: "Erdbeere",
        unlockLevel: 2,
        growthDurationSec: 180,
        waterIntervalSec: 60,
        harvestSeedYieldMin: 1,
        harvestSeedYieldMax: 2,
        harvestGoodsYieldMin: 2,
        harvestGoodsYieldMax: 3,
        experienceReward: 8,
    },
];

