import type {
    GardenClientAction,
    GardenInventoryItem,
    GardenModeState,
    GardenPlantDefinition,
    GardenPlotState,
    SessionState,
} from "@birthday/shared";
import {GameActionResult, GameModeEngine} from "../gameModeEngine.js";

const DEFAULT_GARDEN_PLANTS: GardenPlantDefinition[] = [
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

export class GardenCoopEngine implements GameModeEngine<"garden-coop", GardenModeState> {
    public readonly mode = "garden-coop" as const;

    public createInitialState(): GardenModeState {
        const plantDefinitions = Object.fromEntries(DEFAULT_GARDEN_PLANTS.map((plantDefinition) => [plantDefinition.id, plantDefinition]));
        const plots: Record<string, GardenPlotState> = {};

        for (let plotIndex = 1; plotIndex <= 6; plotIndex += 1) {
            const plotId = `plot-${plotIndex}`;
            plots[plotId] = {
                id: plotId,
                status: "EMPTY",
                plantId: null,
                plantedAt: null,
                growthReadyAt: null,
                nextWaterDueAt: null,
                pestSince: null,
                lastCaretakerPlayerId: null,
            };
        }

        return {
            mode: "garden-coop",
            level: 1,
            experiencePoints: 0,
            unlockedPlantIds: ["carrot"],
            inventory: {
                carrot: {
                    plantId: "carrot",
                    seeds: 4,
                    harvestedGoods: 0,
                },
            },
            plots,
            customerOrders: {},
            plantDefinitions,
        };
    }

    public onPlayerJoined(): GameActionResult<"garden-coop"> {
        return {
            stateChanged: false,
            emittedEvents: [],
        };
    }

    public startMode(): GameActionResult<"garden-coop"> {
        return {
            stateChanged: false,
            emittedEvents: [],
        };
    }

    public resetMode(args: {
        sessionState: SessionState<GardenModeState>;
    }): GameActionResult<"garden-coop"> {
        args.sessionState.modeState = this.createInitialState();

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    public applyAction(args: {
        sessionState: SessionState<GardenModeState>;
        action: GardenClientAction;
        context: { playerId: string; now: number };
    }): GameActionResult<"garden-coop"> {
        switch (args.action.type) {
            case "plant-seed": {
                return this.handlePlantSeed(args.sessionState, args.action.plotId, args.action.plantId, args.context.playerId, args.context.now);
            }

            case "water-plant": {
                return this.handleWaterPlant(args.sessionState, args.action.plotId, args.context.playerId, args.context.now);
            }

            case "harvest-plant": {
                return this.handleHarvestPlant(args.sessionState, args.action.plotId, args.context.playerId, args.context.now);
            }

            case "clear-pest": {
                return this.handleClearPest(args.sessionState, args.action.plotId, args.context.playerId, args.context.now);
            }

            case "fulfill-order": {
                return this.handleFulfillOrder(args.sessionState, args.action.orderId, args.action.plantId, args.action.amount);
            }

            default: {
                return {
                    stateChanged: false,
                    emittedEvents: [],
                };
            }
        }
    }

    private handlePlantSeed(
        sessionState: SessionState<GardenModeState>,
        plotId: string,
        plantId: string,
        playerId: string,
        now: number,
    ): GameActionResult<"garden-coop"> {
        const plot = sessionState.modeState.plots[plotId];
        const inventoryItem = sessionState.modeState.inventory[plantId];
        const plantDefinition = sessionState.modeState.plantDefinitions[plantId];

        if (!plot || !inventoryItem || !plantDefinition) {
            return { stateChanged: false, emittedEvents: [] };
        }

        if (plot.status !== "EMPTY") {
            return { stateChanged: false, emittedEvents: [] };
        }

        if (inventoryItem.seeds <= 0) {
            return { stateChanged: false, emittedEvents: [] };
        }

        inventoryItem.seeds -= 1;
        plot.status = "GROWING";
        plot.plantId = plantId;
        plot.plantedAt = now;
        plot.growthReadyAt = now + plantDefinition.growthDurationSec * 1000;
        plot.nextWaterDueAt = now + plantDefinition.waterIntervalSec * 1000;
        plot.pestSince = null;
        plot.lastCaretakerPlayerId = playerId;

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    private handleWaterPlant(
        sessionState: SessionState<GardenModeState>,
        plotId: string,
        playerId: string,
        now: number,
    ): GameActionResult<"garden-coop"> {
        const plot = sessionState.modeState.plots[plotId];

        if (!plot || plot.status !== "GROWING" || !plot.plantId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        const plantDefinition = sessionState.modeState.plantDefinitions[plot.plantId];

        if (!plantDefinition) {
            return { stateChanged: false, emittedEvents: [] };
        }

        plot.nextWaterDueAt = now + plantDefinition.waterIntervalSec * 1000;
        plot.lastCaretakerPlayerId = playerId;

        if (plot.growthReadyAt !== null && now >= plot.growthReadyAt) {
            plot.status = "READY";

            return {
                stateChanged: true,
                emittedEvents: [
                    {
                        type: "garden-plot-ready",
                        plotId,
                        plantId: plot.plantId,
                    },
                ],
            };
        }

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    private handleHarvestPlant(
        sessionState: SessionState<GardenModeState>,
        plotId: string,
        playerId: string,
        now: number,
    ): GameActionResult<"garden-coop"> {
        const plot = sessionState.modeState.plots[plotId];

        if (!plot || plot.status !== "READY" || !plot.plantId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        const plantDefinition = sessionState.modeState.plantDefinitions[plot.plantId];
        const inventoryItem = this.getOrCreateInventoryItem(sessionState.modeState, plot.plantId);

        inventoryItem.seeds += plantDefinition.harvestSeedYieldMin;
        inventoryItem.harvestedGoods += plantDefinition.harvestGoodsYieldMin;

        sessionState.modeState.experiencePoints += plantDefinition.experienceReward;

        plot.status = "EMPTY";
        plot.plantId = null;
        plot.plantedAt = null;
        plot.growthReadyAt = null;
        plot.nextWaterDueAt = null;
        plot.pestSince = null;
        plot.lastCaretakerPlayerId = playerId;

        const emittedEvents: Array<{ type: "garden-level-up"; newLevel: number }> = [];
        const nextLevel = this.calculateLevel(sessionState.modeState.experiencePoints);

        if (nextLevel > sessionState.modeState.level) {
            sessionState.modeState.level = nextLevel;
            emittedEvents.push({
                type: "garden-level-up",
                newLevel: nextLevel,
            });
        }

        return {
            stateChanged: true,
            emittedEvents,
        };
    }

    private handleClearPest(
        sessionState: SessionState<GardenModeState>,
        plotId: string,
        playerId: string,
        now: number,
    ): GameActionResult<"garden-coop"> {
        const plot = sessionState.modeState.plots[plotId];

        if (!plot || plot.status !== "PAUSED_BY_PEST" || !plot.plantId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        const plantDefinition = sessionState.modeState.plantDefinitions[plot.plantId];

        plot.status = "GROWING";
        plot.pestSince = null;
        plot.lastCaretakerPlayerId = playerId;
        plot.nextWaterDueAt = now + plantDefinition.waterIntervalSec * 1000;

        return {
            stateChanged: true,
            emittedEvents: [],
        };
    }

    private handleFulfillOrder(
        sessionState: SessionState<GardenModeState>,
        orderId: string,
        plantId: string,
        amount: number,
    ): GameActionResult<"garden-coop"> {
        const order = sessionState.modeState.customerOrders[orderId];
        const inventoryItem = sessionState.modeState.inventory[plantId];

        if (!order || !inventoryItem) {
            return { stateChanged: false, emittedEvents: [] };
        }

        if (inventoryItem.harvestedGoods < amount) {
            return { stateChanged: false, emittedEvents: [] };
        }

        inventoryItem.harvestedGoods -= amount;
        order.fulfilledAmount += amount;

        const isCompleted = order.fulfilledAmount >= order.requestedAmount;

        if (!isCompleted) {
            return {
                stateChanged: true,
                emittedEvents: [],
            };
        }

        sessionState.modeState.experiencePoints += order.experienceReward;
        delete sessionState.modeState.customerOrders[orderId];

        return {
            stateChanged: true,
            emittedEvents: [
                {
                    type: "garden-order-fulfilled",
                    orderId,
                    experienceGained: order.experienceReward,
                },
            ],
        };
    }

    private getOrCreateInventoryItem(modeState: GardenModeState, plantId: string): GardenInventoryItem {
        const existingInventoryItem = modeState.inventory[plantId];

        if (existingInventoryItem) {
            return existingInventoryItem;
        }

        const createdInventoryItem: GardenInventoryItem = {
            plantId,
            seeds: 0,
            harvestedGoods: 0,
        };

        modeState.inventory[plantId] = createdInventoryItem;
        return createdInventoryItem;
    }

    private calculateLevel(experiencePoints: number): number {
        return 1 + Math.floor(experiencePoints / 25);
    }
}