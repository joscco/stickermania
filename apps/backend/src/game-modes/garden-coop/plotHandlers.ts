import type {GardenModeState, SessionState} from "@birthday/shared";
import type {GameActionResult} from "../gameModeEngine.js";
import {calculateLevel, getOrCreateInventoryItem} from "./inventoryHelpers.js";

export function handlePlantSeed(
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
        return {stateChanged: false, emittedEvents: []};
    }

    if (plot.status !== "EMPTY") {
        return {stateChanged: false, emittedEvents: []};
    }

    if (inventoryItem.seeds <= 0) {
        return {stateChanged: false, emittedEvents: []};
    }

    inventoryItem.seeds -= 1;
    plot.status = "GROWING";
    plot.plantId = plantId;
    plot.plantedAt = now;
    plot.growthReadyAt = now + plantDefinition.growthDurationSec * 1000;
    plot.nextWaterDueAt = now + plantDefinition.waterIntervalSec * 1000;
    plot.pestSince = null;
    plot.lastCaretakerPlayerId = playerId;

    return {stateChanged: true, emittedEvents: []};
}

export function handleWaterPlant(
    sessionState: SessionState<GardenModeState>,
    plotId: string,
    playerId: string,
    now: number,
): GameActionResult<"garden-coop"> {
    const plot = sessionState.modeState.plots[plotId];

    if (!plot || plot.status !== "GROWING" || !plot.plantId) {
        return {stateChanged: false, emittedEvents: []};
    }

    const plantDefinition = sessionState.modeState.plantDefinitions[plot.plantId];
    if (!plantDefinition) {
        return {stateChanged: false, emittedEvents: []};
    }

    plot.nextWaterDueAt = now + plantDefinition.waterIntervalSec * 1000;
    plot.lastCaretakerPlayerId = playerId;

    if (plot.growthReadyAt !== null && now >= plot.growthReadyAt) {
        plot.status = "READY";
        return {
            stateChanged: true,
            emittedEvents: [{type: "garden-plot-ready", plotId, plantId: plot.plantId}],
        };
    }

    return {stateChanged: true, emittedEvents: []};
}

export function handleHarvestPlant(
    sessionState: SessionState<GardenModeState>,
    plotId: string,
    playerId: string,
    now: number,
): GameActionResult<"garden-coop"> {
    const plot = sessionState.modeState.plots[plotId];

    if (!plot || plot.status !== "READY" || !plot.plantId) {
        return {stateChanged: false, emittedEvents: []};
    }

    const plantDefinition = sessionState.modeState.plantDefinitions[plot.plantId];
    const inventoryItem = getOrCreateInventoryItem(sessionState.modeState, plot.plantId);

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

    const emittedEvents: Array<{type: "garden-level-up"; newLevel: number}> = [];
    const nextLevel = calculateLevel(sessionState.modeState.experiencePoints);

    if (nextLevel > sessionState.modeState.level) {
        sessionState.modeState.level = nextLevel;
        emittedEvents.push({type: "garden-level-up", newLevel: nextLevel});
    }

    return {stateChanged: true, emittedEvents};
}

export function handleClearPest(
    sessionState: SessionState<GardenModeState>,
    plotId: string,
    playerId: string,
    now: number,
): GameActionResult<"garden-coop"> {
    const plot = sessionState.modeState.plots[plotId];

    if (!plot || plot.status !== "PAUSED_BY_PEST" || !plot.plantId) {
        return {stateChanged: false, emittedEvents: []};
    }

    const plantDefinition = sessionState.modeState.plantDefinitions[plot.plantId];

    plot.status = "GROWING";
    plot.pestSince = null;
    plot.lastCaretakerPlayerId = playerId;
    plot.nextWaterDueAt = now + plantDefinition.waterIntervalSec * 1000;

    return {stateChanged: true, emittedEvents: []};
}

