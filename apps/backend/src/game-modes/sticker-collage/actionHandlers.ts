import crypto from "node:crypto";
import type {
    GameConfig,
    SessionState,
    StickerCollageGameState,
    StickerCollageServerEvent,
    StickerPlacement,
    StickerDefinition,
    StickerCollage,
    StickerCollageBuildingState,
    StickerCollageVotingState,
    StickerCollageResultsState,
} from "@birthday/shared";
import {dealHand} from "./stickerCatalog.js";
import {transitionToBuilding, transitionToVoting, transitionToResults, transitionToNextRound} from "./roundManager.js";

// ─── Helpers ────────────────────────────────────────────────────

type HandlerResult = {stateChanged: boolean; events: StickerCollageServerEvent[]};
const noChange: HandlerResult = {stateChanged: false, events: []};

function asBuildingPhase(gameState: StickerCollageGameState): StickerCollageBuildingState | null {
    return gameState.phaseState.phase === "BUILDING" ? gameState.phaseState : null;
}

function asVotingPhase(gameState: StickerCollageGameState): StickerCollageVotingState | null {
    return gameState.phaseState.phase === "VOTING" ? gameState.phaseState : null;
}

function asResultsPhase(gameState: StickerCollageGameState): StickerCollageResultsState | null {
    return gameState.phaseState.phase === "RESULTS" ? gameState.phaseState : null;
}

// ─── LOBBY ──────────────────────────────────────────────────────

/**
 * "start-game": LOBBY → BUILDING (first round).
 */
export function startGame(
    state: SessionState,
    config: GameConfig,
    now: number,
): HandlerResult {
    if (state.gameState.phaseState.phase !== "LOBBY") {
        return noChange;
    }

    transitionToBuilding(state, config.stickerCollage, now);

    const {gameState} = state;
    const buildingPhase = gameState.phaseState;
    if (buildingPhase.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [
            {type: "game-started"},
            {type: "round-started", roundIndex: gameState.currentRoundIndex, prompt: gameState.currentPrompt, endsAt: buildingPhase.roundEndsAt},
        ],
    };
}

// ─── BUILDING ───────────────────────────────────────────────────

/**
 * "request-hand": deal a sticker hand to the requesting player.
 */
export function dealHandToPlayer(
    state: SessionState,
    playerId: string,
    config: GameConfig,
): HandlerResult {
    const {gameState} = state;
    const buildingPhase = asBuildingPhase(gameState);
    if (!buildingPhase) {
        return noChange;
    }
    if (buildingPhase.playerHands[playerId]) {
        return noChange;
    }

    const hand = dealHand(gameState.stickerCatalog, config.stickerCollage, gameState.unlockedPackIds, gameState.guaranteedPackId, gameState.stickerPacks);
    buildingPhase.playerHands[playerId] = hand;

    if (!gameState.roundParticipantIds.includes(playerId)) {
        gameState.roundParticipantIds.push(playerId);
    }

    return {stateChanged: true, events: [{type: "hand-dealt", targetPlayerId: playerId, hand}]};
}

/**
 * "submit-collage": save a player's collage for the current round.
 */
export function submitCollage(
    state: SessionState,
    playerId: string,
    placements: StickerPlacement[],
    config: GameConfig,
    now: number,
): HandlerResult {
    const {gameState} = state;
    const buildingPhase = asBuildingPhase(gameState);
    if (!buildingPhase) {
        return noChange;
    }

    const hand = buildingPhase.playerHands[playerId];
    if (!hand) {
        return noChange;
    }

    const handSet = new Set(hand.stickerIds);
    if (placements.some(placement => !handSet.has(placement.stickerId))) {
        return noChange;
    }
    if (placements.length > config.stickerCollage.maxStickersOnCanvas) {
        return noChange;
    }

    const {currentRoundIndex} = gameState;
    const existingSubmissions = gameState.submissions[currentRoundIndex] ?? [];
    gameState.submissions[currentRoundIndex] = existingSubmissions.filter((sub: StickerCollage) => sub.playerId !== playerId);

    const collageId = `collage_${playerId}_${currentRoundIndex}_${crypto.randomUUID().slice(0, 6)}`;
    const collage: StickerCollage = {id: collageId, playerId, roundIndex: currentRoundIndex, placements, submittedAt: now};
    gameState.submissions[currentRoundIndex].push(collage);

    return {stateChanged: true, events: [{type: "collage-submitted", playerId, collageId}]};
}

/**
 * "skip-round": mark the player as skipping (no collage this round).
 */
export function skipRound(
    state: SessionState,
    playerId: string,
): HandlerResult {
    const buildingPhase = asBuildingPhase(state.gameState);
    if (!buildingPhase) {
        return noChange;
    }
    if (buildingPhase.skippedPlayerIds.includes(playerId)) {
        return noChange;
    }

    buildingPhase.skippedPlayerIds.push(playerId);
    return {stateChanged: true, events: []};
}

/**
 * "end-round-early": BUILDING → VOTING (triggered by a player or the board).
 */
export function endBuildingPhaseEarly(
    state: SessionState,
    config: GameConfig,
    now: number,
): HandlerResult {
    if (!asBuildingPhase(state.gameState)) {
        return noChange;
    }

    transitionToVoting(state, config.stickerCollage, now);

    const {phaseState} = state.gameState;
    if (phaseState.phase !== "VOTING") {
        return noChange;
    }

    return {stateChanged: true, events: [{type: "voting-started", votingEndsAt: phaseState.votingEndsAt}]};
}

// ─── VOTING ─────────────────────────────────────────────────────

/**
 * "cast-vote": vote for a collage (max votesPerPlayer per player, no self-votes).
 */
export function castVote(
    state: SessionState,
    playerId: string,
    collageId: string,
    config: GameConfig,
): HandlerResult {
    const {gameState} = state;
    const votingPhase = asVotingPhase(gameState);
    if (!votingPhase) {
        return noChange;
    }

    const roundSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    const targetCollage = roundSubmissions.find((sub: StickerCollage) => sub.id === collageId);
    if (!targetCollage || targetCollage.playerId === playerId) {
        return noChange;
    }

    const myVotes = votingPhase.currentVotes[playerId] ?? [];
    if (myVotes.length >= config.stickerCollage.votesPerPlayer) {
        // Remove the first vote
        votingPhase.currentVotes[playerId] = [...myVotes.slice(1), collageId];
        return {stateChanged: true, events: [{type: "vote-registered", voterId: playerId, collageId}]};
    }

    if (myVotes.includes(collageId)) {
        // Remove the selected vote again
        votingPhase.currentVotes[playerId] = myVotes.filter(v => v !== collageId);
        return {stateChanged: true, events: [{type: "vote-unregistered", voterId: playerId, collageId}]};
    }

    votingPhase.currentVotes[playerId] = [...myVotes, collageId];
    return {stateChanged: true, events: [{type: "vote-registered", voterId: playerId, collageId}]};
}

/**
 * "done-voting": signal that this player has finished voting.
 * Does NOT auto-advance — when all connected participants are done,
 * the client shows an "end voting" button that requires an explicit press.
 */
export function markPlayerDoneVoting(
    state: SessionState,
    playerId: string,
): HandlerResult {
    const votingPhase = asVotingPhase(state.gameState);
    if (!votingPhase) {
        return noChange;
    }
    if (votingPhase.doneVotingIds.includes(playerId)) {
        return noChange;
    }

    votingPhase.doneVotingIds.push(playerId);
    return {stateChanged: true, events: []};
}

/**
 * "end-voting-early": VOTING → RESULTS (explicit trigger from player or board).
 */
export function endVotingPhaseEarly(
    state: SessionState,
    config: GameConfig,
    now: number,
): HandlerResult {
    if (!asVotingPhase(state.gameState)) {
        return noChange;
    }

    transitionToResults(state, config.stickerCollage, now);
    return buildResultsEvents(state);
}

function buildResultsEvents(state: SessionState): HandlerResult {
    const resultsPhase = asResultsPhase(state.gameState)!;
    const scoreEvents: StickerCollageServerEvent[] = resultsPhase.lastVoteResults
        .filter(result => result.pointsAwarded > 0 && state.players[result.playerId])
        .map(result => ({type: "score-update", playerId: result.playerId, newScore: state.players[result.playerId].score}));

    return {
        stateChanged: true,
        events: [
            ...scoreEvents,
            {type: "results-ready", winnerId: resultsPhase.winnerId, results: resultsPhase.lastVoteResults},
        ],
    };
}

// ─── RESULTS ────────────────────────────────────────────────────

/**
 * "pick-prompt": winner picks the next round's prompt from the offered choices.
 */
export function winnerPicksPrompt(
    state: SessionState,
    playerId: string,
    prompt: string,
): HandlerResult {
    const {gameState} = state;
    const resultsPhase = asResultsPhase(gameState);
    if (!resultsPhase || resultsPhase.winnerId !== playerId) {
        return noChange;
    }
    if (!resultsPhase.promptChoices.includes(prompt)) {
        return noChange;
    }

    gameState.promptHistory[gameState.currentRoundIndex + 1] = prompt;
    return {stateChanged: true, events: [{type: "prompt-chosen", prompt}]};
}

/**
 * "unlock-pack": winner unlocks a new sticker pack.
 */
export function winnerUnlocksPack(
    state: SessionState,
    playerId: string,
    packId: string,
): HandlerResult {
    const {gameState} = state;
    const resultsPhase = asResultsPhase(gameState);
    if (!resultsPhase || resultsPhase.winnerId !== playerId) {
        return noChange;
    }
    if (!resultsPhase.packUnlockChoices.includes(packId)) {
        return noChange;
    }
    if (gameState.unlockedPackIds.includes(packId)) {
        return noChange;
    }

    gameState.unlockedPackIds.push(packId);
    resultsPhase.lastUnlockedPackId = packId;

    const pack = gameState.stickerPacks.find(p => p.id === packId);
    return {stateChanged: true, events: [{type: "pack-unlocked", packId, packName: pack?.name ?? packId}]};
}

/**
 * "pick-guaranteed-pack": winner picks which pack is guaranteed in next round's hands.
 * This also marks all winner choices as done.
 */
export function winnerPicksGuaranteedPack(
    state: SessionState,
    playerId: string,
    packId: string,
): HandlerResult {
    const {gameState} = state;
    const resultsPhase = asResultsPhase(gameState);
    if (!resultsPhase || resultsPhase.winnerId !== playerId) {
        return noChange;
    }
    if (!gameState.unlockedPackIds.includes(packId)) {
        return noChange;
    }

    gameState.guaranteedPackId = packId;
    resultsPhase.winnerChoicesDone = true;

    const pack = gameState.stickerPacks.find(p => p.id === packId);
    return {stateChanged: true, events: [{type: "guaranteed-pack-chosen", packId, packName: pack?.name ?? packId}]};
}

/**
 * "ready-to-advance": any player pressing this immediately starts the next round.
 * Only available once the winner has completed their choices (or there is no winner).
 */
export function advanceToNextRound(
    state: SessionState,
    playerId: string,
    config: GameConfig,
    now: number,
): HandlerResult {
    const resultsPhase = asResultsPhase(state.gameState);
    if (!resultsPhase) {
        return noChange;
    }
    if (resultsPhase.readyToAdvanceIds.includes(playerId)) {
        return noChange;
    }

    resultsPhase.readyToAdvanceIds.push(playerId);
    transitionToNextRound(state, config.stickerCollage, now);

    const {gameState} = state;
    const {phaseState} = gameState;
    if (phaseState.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [{type: "round-started", roundIndex: gameState.currentRoundIndex, prompt: gameState.currentPrompt, endsAt: phaseState.roundEndsAt}],
    };
}

/**
 * "advance-from-results": board-triggered advance to the next round.
 */
export function boardAdvancesToNextRound(
    state: SessionState,
    config: GameConfig,
    now: number,
): HandlerResult {
    if (!asResultsPhase(state.gameState)) {
        return noChange;
    }

    transitionToNextRound(state, config.stickerCollage, now);

    const {gameState} = state;
    const {phaseState} = gameState;
    if (phaseState.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [{type: "round-started", roundIndex: gameState.currentRoundIndex, prompt: gameState.currentPrompt, endsAt: phaseState.roundEndsAt}],
    };
}
