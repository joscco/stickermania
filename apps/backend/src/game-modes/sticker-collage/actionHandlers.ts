import crypto from "node:crypto";
import type {
    GameConfig,
    SessionState,
    StickerCollageModeState,
    StickerCollageClientAction,
    StickerCollageServerEvent,
    StickerPlacement,
    StickerDefinition,
    StickerCollage,
} from "@birthday/shared";
import {dealHand} from "./stickerCatalog.js";

/**
 * Handle "request-hand": deal a sticker hand to the requesting player if they don't have one yet.
 */
export function handleRequestHand(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    config: GameConfig,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;

    if (ms.phase !== "BUILDING") {
        return {stateChanged: false, events: []};
    }

    // Already has a hand for this round
    if (ms.playerHands[playerId]) {
        return {stateChanged: false, events: []};
    }

    const hand = dealHand(ms.stickerCatalog, config.stickerCollage);
    ms.playerHands[playerId] = hand;

    return {
        stateChanged: true,
        events: [{type: "hand-dealt", targetPlayerId: playerId, hand}],
    };
}

/**
 * Handle "swap-sticker": replace one sticker in the hand with a new one.
 */
export function handleSwapSticker(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    handIndex: number,
    newStickerId: string,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;

    if (ms.phase !== "BUILDING") {
        return {stateChanged: false, events: []};
    }

    const hand = ms.playerHands[playerId];
    if (!hand) {
        return {stateChanged: false, events: []};
    }

    if (hand.swapsRemaining <= 0) {
        return {stateChanged: false, events: []};
    }

    if (handIndex < 0 || handIndex >= hand.stickerIds.length) {
        return {stateChanged: false, events: []};
    }

    // Verify the new sticker exists in the catalog
    if (!ms.stickerCatalog.find((s: StickerDefinition) => s.id === newStickerId)) {
        return {stateChanged: false, events: []};
    }

    // Don't swap to a sticker already in hand
    if (hand.stickerIds.includes(newStickerId)) {
        return {stateChanged: false, events: []};
    }

    hand.stickerIds[handIndex] = newStickerId;
    hand.swapsRemaining -= 1;

    return {
        stateChanged: true,
        events: [{type: "hand-dealt", targetPlayerId: playerId, hand}],
    };
}

/**
 * Handle "submit-collage": save a player's collage submission for the current round.
 */
export function handleSubmitCollage(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    placements: StickerPlacement[],
    config: GameConfig,
    now: number,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;

    if (ms.phase !== "BUILDING") {
        return {stateChanged: false, events: []};
    }

    const hand = ms.playerHands[playerId];
    if (!hand) {
        return {stateChanged: false, events: []};
    }

    // Validate: all sticker IDs in placements must be from the player's hand
    const handSet = new Set(hand.stickerIds);
    for (const p of placements) {
        if (!handSet.has(p.stickerId)) {
            return {stateChanged: false, events: []};
        }
    }

    // Enforce max stickers on canvas
    if (placements.length > config.stickerCollage.maxStickersOnCanvas) {
        return {stateChanged: false, events: []};
    }

    // Remove any existing submission from this player for this round (allow re-submit)
    const roundSubs = ms.submissions[ms.currentRoundIndex] ?? [];
    ms.submissions[ms.currentRoundIndex] = roundSubs.filter((s: StickerCollage) => s.playerId !== playerId);

    const collageId = `collage_${playerId}_${ms.currentRoundIndex}_${crypto.randomUUID().slice(0, 6)}`;
    const collage = {
        id: collageId,
        playerId,
        roundIndex: ms.currentRoundIndex,
        placements,
        submittedAt: now,
    };

    ms.submissions[ms.currentRoundIndex].push(collage);

    return {
        stateChanged: true,
        events: [{type: "collage-submitted", playerId, collageId}],
    };
}

/**
 * Handle "cast-vote": vote for a collage from the previous round.
 */
export function handleCastVote(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    collageId: string,
    config: GameConfig,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;

    if (ms.phase !== "BUILDING") {
        return {stateChanged: false, events: []};
    }

    // Can only vote if there's a previous round
    const votingRoundIndex = ms.currentRoundIndex - 1;
    if (votingRoundIndex < 1) {
        return {stateChanged: false, events: []};
    }

    const previousSubmissions = ms.submissions[votingRoundIndex] ?? [];
    const targetCollage = previousSubmissions.find((c: StickerCollage) => c.id === collageId);
    if (!targetCollage) {
        return {stateChanged: false, events: []};
    }

    // Can't vote for your own collage
    if (targetCollage.playerId === playerId) {
        return {stateChanged: false, events: []};
    }

    // Check vote limits
    const existingVotes = ms.currentVotes[playerId] ?? [];
    if (existingVotes.length >= config.stickerCollage.votesPerPlayer) {
        return {stateChanged: false, events: []};
    }

    // Can't double-vote for the same collage
    if (existingVotes.includes(collageId)) {
        return {stateChanged: false, events: []};
    }

    ms.currentVotes[playerId] = [...existingVotes, collageId];

    return {
        stateChanged: true,
        events: [{type: "vote-registered", voterId: playerId, collageId}],
    };
}

