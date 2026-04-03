import type {GardenModeState, SessionState} from "@birthday/shared";
import type {GameActionResult} from "../gameModeEngine.js";

export function handleFulfillOrder(
    sessionState: SessionState<GardenModeState>,
    orderId: string,
    plantId: string,
    amount: number,
): GameActionResult<"garden-coop"> {
    const order = sessionState.modeState.customerOrders[orderId];
    const inventoryItem = sessionState.modeState.inventory[plantId];

    if (!order || !inventoryItem) {
        return {stateChanged: false, emittedEvents: []};
    }

    if (inventoryItem.harvestedGoods < amount) {
        return {stateChanged: false, emittedEvents: []};
    }

    inventoryItem.harvestedGoods -= amount;
    order.fulfilledAmount += amount;

    const isCompleted = order.fulfilledAmount >= order.requestedAmount;

    if (!isCompleted) {
        return {stateChanged: true, emittedEvents: []};
    }

    sessionState.modeState.experiencePoints += order.experienceReward;
    delete sessionState.modeState.customerOrders[orderId];

    return {
        stateChanged: true,
        emittedEvents: [
            {type: "garden-order-fulfilled", orderId, experienceGained: order.experienceReward},
        ],
    };
}

