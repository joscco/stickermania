import crypto from "node:crypto";
import type {
    GameConfig,
    SessionState,
    StickerCollageModeState,
    StickerCollageServerEvent,
    StickerPlacement,
    StickerDefinition,
    StickerCollage,
} from "@birthday/shared";
import {dealHand} from "./stickerCatalog.js";
import {startBuilding, startVoting, startResults, advanceFromResults} from "./roundManager.js";

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

    if (ms.playerHands[playerId]) {
        return {stateChanged: false, events: []};
    }

    const hand = dealHand(
        ms.stickerCatalog,
        config.stickerCollage,
        ms.unlockedPackIds,
        ms.guaranteedPackId,
        ms.stickerPacks,
    );
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
    if (!hand) return {stateChanged: false, events: []};
    if (hand.swapsRemaining <= 0) return {stateChanged: false, events: []};
    if (handIndex < 0 || handIndex >= hand.stickerIds.length) return {stateChanged: false, events: []};
    if (!ms.stickerCatalog.find((s: StickerDefinition) => s.id === newStickerId)) return {stateChanged: false, events: []};
    if (hand.stickerIds.includes(newStickerId)) return {stateChanged: false, events: []};

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
    if (!hand) return {stateChanged: false, events: []};

    const handSet = new Set(hand.stickerIds);
    for (const p of placements) {
        if (!handSet.has(p.stickerId)) return {stateChanged: false, events: []};
    }

    if (placements.length > config.stickerCollage.maxStickersOnCanvas) {
        return {stateChanged: false, events: []};
    }

    const roundSubs = ms.submissions[ms.currentRoundIndex] ?? [];
    ms.submissions[ms.currentRoundIndex] = roundSubs.filter((s: StickerCollage) => s.playerId !== playerId);

    const collageId = `collage_${playerId}_${ms.currentRoundIndex}_${crypto.randomUUID().slice(0, 6)}`;
    const collage: StickerCollage = {
        id: collageId,
        playerId,
        roundIndex: ms.currentRoundIndex,
        placements,
        submittedAt: now,
    };

    ms.submissions[ms.currentRoundIndex].push(collage);

    const events: StickerCollageServerEvent[] = [{type: "collage-submitted", playerId, collageId}];

    return {stateChanged: true, events};
}

/**
 * Handle "skip-round": mark player as skipping this round (no submission).
 * Does NOT auto-advance to voting — that requires an explicit "end-round-early".
 */
export function handleSkipRound(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "BUILDING") {
        return {stateChanged: false, events: []};
    }
    if (ms.skippedPlayerIds.includes(playerId)) {
        return {stateChanged: false, events: []};
    }

    ms.skippedPlayerIds.push(playerId);

    return {stateChanged: true, events: []};
}

/**
 * Handle "cast-vote": vote for a collage from the CURRENT round (during VOTING phase).
 */
export function handleCastVote(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    collageId: string,
    config: GameConfig,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;

    if (ms.phase !== "VOTING") {
        return {stateChanged: false, events: []};
    }

    const currentSubmissions = ms.submissions[ms.currentRoundIndex] ?? [];
    const targetCollage = currentSubmissions.find((c: StickerCollage) => c.id === collageId);
    if (!targetCollage) return {stateChanged: false, events: []};

    // Can't vote for your own collage
    if (targetCollage.playerId === playerId) return {stateChanged: false, events: []};

    const existingVotes = ms.currentVotes[playerId] ?? [];
    if (existingVotes.length >= config.stickerCollage.votesPerPlayer) return {stateChanged: false, events: []};
    if (existingVotes.includes(collageId)) return {stateChanged: false, events: []};

    ms.currentVotes[playerId] = [...existingVotes, collageId];

    return {
        stateChanged: true,
        events: [{type: "vote-registered", voterId: playerId, collageId}],
    };
}

/**
 * Handle "start-game": LOBBY → BUILDING (first round).
 */
export function handleStartGame(
    state: SessionState<StickerCollageModeState>,
    config: GameConfig,
    now: number,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "LOBBY") return {stateChanged: false, events: []};

    startBuilding(state, config.stickerCollage, now);

    return {
        stateChanged: true,
        events: [
            {type: "game-started"},
            {
                type: "round-started",
                roundIndex: ms.currentRoundIndex,
                prompt: ms.currentPrompt,
                endsAt: ms.roundEndsAt!,
            },
        ],
    };
}

/**
 * Handle "end-round-early": BUILDING → VOTING.
 */
export function handleEndRoundEarly(
    state: SessionState<StickerCollageModeState>,
    config: GameConfig,
    now: number,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "BUILDING") return {stateChanged: false, events: []};

    startVoting(state, config.stickerCollage, now);

    return {
        stateChanged: true,
        events: [{type: "voting-started", votingEndsAt: ms.votingEndsAt!}],
    };
}

/**
 * Handle "end-voting-early": VOTING → RESULTS.
 */
export function handleEndVotingEarly(
    state: SessionState<StickerCollageModeState>,
    config: GameConfig,
    now: number,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "VOTING") return {stateChanged: false, events: []};

    startResults(state, config.stickerCollage, now);

    const events: StickerCollageServerEvent[] = [];

    // Score updates
    for (const result of ms.lastVoteResults) {
        if (result.pointsAwarded > 0 && state.players[result.playerId]) {
            events.push({
                type: "score-update",
                playerId: result.playerId,
                newScore: state.players[result.playerId].score,
            });
        }
    }

    events.push({
        type: "results-ready",
        winnerId: ms.winnerId,
        results: ms.lastVoteResults,
    });

    return {stateChanged: true, events};
}

/**
 * Handle "pick-prompt": winner picks the next round's prompt.
 */
export function handlePickPrompt(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    prompt: string,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "RESULTS") {
        return {stateChanged: false, events: []};
    }
    if (ms.winnerId !== playerId) {
        return {stateChanged: false, events: []};
    }
    if (!ms.promptChoices.includes(prompt)) {
        return {stateChanged: false, events: []};
    }

    // Store for use when advancing to next round
    ms.promptHistory[ms.currentRoundIndex + 1] = prompt;

    return {
        stateChanged: true,
        events: [{type: "prompt-chosen", prompt}],
    };
}

/**
 * Handle "unlock-pack": winner unlocks a new sticker pack.
 */
export function handleUnlockPack(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    packId: string,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "RESULTS") {
        return {stateChanged: false, events: []};
    }
    if (ms.winnerId !== playerId) {
        return {stateChanged: false, events: []};
    }
    if (!ms.packUnlockChoices.includes(packId)) {
        return {stateChanged: false, events: []};
    }
    if (ms.unlockedPackIds.includes(packId)) {
        return {stateChanged: false, events: []};
    }

    ms.unlockedPackIds.push(packId);
    ms.lastUnlockedPackId = packId;

    const pack = ms.stickerPacks.find(p => p.id === packId);
    const packName = pack?.name ?? packId;

    return {
        stateChanged: true,
        events: [{type: "pack-unlocked", packId, packName}],
    };
}

/**
 * Handle "pick-guaranteed-pack": winner picks which pack is guaranteed in next round's hands.
 */
export function handlePickGuaranteedPack(
    state: SessionState<StickerCollageModeState>,
    playerId: string,
    packId: string,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "RESULTS") return {stateChanged: false, events: []};
    if (ms.winnerId !== playerId) return {stateChanged: false, events: []};
    if (!ms.unlockedPackIds.includes(packId)) return {stateChanged: false, events: []};

    ms.guaranteedPackId = packId;

    // Mark winner choices as done
    ms.winnerChoicesDone = true;

    const pack = ms.stickerPacks.find(p => p.id === packId);
    const packName = pack?.name ?? packId;

    return {
        stateChanged: true,
        events: [{type: "guaranteed-pack-chosen", packId, packName}],
    };
}

/**
 * Handle "advance-from-results": RESULTS → next round (board or winner trigger).
 */
export function handleAdvanceFromResults(
    state: SessionState<StickerCollageModeState>,
    config: GameConfig,
    now: number,
): {stateChanged: boolean; events: StickerCollageServerEvent[]} {
    const ms = state.modeState;
    if (ms.phase !== "RESULTS") return {stateChanged: false, events: []};

    advanceFromResults(state, config.stickerCollage, now);

    return {
        stateChanged: true,
        events: [
            {
                type: "round-started",
                roundIndex: ms.currentRoundIndex,
                prompt: ms.currentPrompt,
                endsAt: ms.roundEndsAt!,
            },
        ],
    };
}
