import type {
    GardenClientAction,
    GardenModeState,
    GardenPlotState,
    SessionState,
} from "@birthday/shared";
import {GameActionResult, GameModeEngine} from "../gameModeEngine.js";
import {DEFAULT_GARDEN_PLANTS} from "./plantDefinitions.js";
import {handleClearPest, handleHarvestPlant, handlePlantSeed, handleWaterPlant} from "./plotHandlers.js";
import {handleFulfillOrder} from "./orderHandlers.js";

export class GardenCoopEngine implements GameModeEngine<"garden-coop", GardenModeState> {
    public readonly mode = "garden-coop" as const;

    public createInitialState(): GardenModeState {
        const plantDefinitions = Object.fromEntries(
            DEFAULT_GARDEN_PLANTS.map((p) => [p.id, p]),
        );

        const plots: Record<string, GardenPlotState> = {};
        for (let i = 1; i <= 6; i++) {
            const plotId = `plot-${i}`;
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
                carrot: {plantId: "carrot", seeds: 4, harvestedGoods: 0},
            },
            plots,
            customerOrders: {},
            plantDefinitions,
        };
    }

    public onPlayerJoined(): GameActionResult<"garden-coop"> {
        return {stateChanged: false, emittedEvents: []};
    }

    public startMode(): GameActionResult<"garden-coop"> {
        return {stateChanged: false, emittedEvents: []};
    }

    public resetMode(args: {
        sessionState: SessionState<GardenModeState>;
    }): GameActionResult<"garden-coop"> {
        args.sessionState.modeState = this.createInitialState();
        return {stateChanged: true, emittedEvents: []};
    }

    public applyAction(args: {
        sessionState: SessionState<GardenModeState>;
        action: GardenClientAction;
        context: { playerId: string; now: number };
    }): GameActionResult<"garden-coop"> {
        switch (args.action.type) {
            case "plant-seed":
                return handlePlantSeed(args.sessionState, args.action.plotId, args.action.plantId, args.context.playerId, args.context.now);

            case "water-plant":
                return handleWaterPlant(args.sessionState, args.action.plotId, args.context.playerId, args.context.now);

            case "harvest-plant":
                return handleHarvestPlant(args.sessionState, args.action.plotId, args.context.playerId, args.context.now);

            case "clear-pest":
                return handleClearPest(args.sessionState, args.action.plotId, args.context.playerId, args.context.now);

            case "fulfill-order":
                return handleFulfillOrder(args.sessionState, args.action.orderId, args.action.plantId, args.action.amount);

            default:
                return {stateChanged: false, emittedEvents: []};
        }
    }
}