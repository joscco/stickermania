import type {GameConfig, SessionState, RoundSubmission, PartyBuildingState, PartyGameState, PartyResultsState, PartyGameServerEvent, PartyVotingState, MinigameClientAction, MinigameConfig, OpenMinigameSubmission,} from "@birthday/shared";
import {shouldSkipVoting, transitionToBuilding, transitionToNextRound, transitionToResults, transitionToVoting} from "./roundManager.js";
import {getMinigameHandler} from "../../../../minigames/registry.js";

// ─── Helpers ────────────────────────────────────────────────────

type HandlerResult = { stateChanged: boolean; events: PartyGameServerEvent[] };
const noChange: HandlerResult = {stateChanged: false, events: []};

function asBuildingPhase(gameState: PartyGameState): PartyBuildingState | null {
    return gameState.phaseState.phase === "BUILDING" ? gameState.phaseState : null;
}

function asVotingPhase(gameState: PartyGameState): PartyVotingState | null {
    return gameState.phaseState.phase === "VOTING" ? gameState.phaseState : null;
}

function asResultsPhase(gameState: PartyGameState): PartyResultsState | null {
    return gameState.phaseState.phase === "RESULTS" ? gameState.phaseState : null;
}

// ─── LOBBY ──────────────────────────────────────────────────────

/**
 * "start-game": LOBBY → BUILDING (first round).
 */
export function startGame(
    state: SessionState,
    config: GameConfig,
    minigameConfig: MinigameConfig,
    now: number,
): HandlerResult {
    if (state.gameState.phaseState.phase !== "LOBBY") {
        return noChange;
    }

    transitionToBuilding(state, minigameConfig, now);

    const {gameState} = state;
    const buildingPhase = gameState.phaseState;
    if (buildingPhase.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [
            {type: "game-started"},
            {
                type: "round-started",
                roundIndex: gameState.currentRoundIndex,
                prompt: gameState.currentPrompt,
                endsAt: buildingPhase.roundEndsAt
            },
        ],
    };
}

// ─── BUILDING ───────────────────────────────────────────────────

/**
 * "skip-round": mark the player as skipping (no submission this round).
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
 * Minigame submission: store the result for the current round.
 */
export function submitMinigame(
    state: SessionState,
    playerId: string,
    action: MinigameClientAction,
    now: number,
): HandlerResult {
    const buildingPhase = asBuildingPhase(state.gameState);
    if (!buildingPhase) {
        return noChange;
    }

    const {gameState} = state;
    const {currentRoundIndex} = gameState;

    const task = gameState.currentTask;
    if (!task) return noChange;

    const handler = getMinigameHandler(task.type);
    if (!handler) return noChange;

    const submission = handler.createSubmission({playerId, roundIndex: currentRoundIndex, task, action, now});
    if (!submission) return noChange;

    const existing = gameState.minigameSubmissions[currentRoundIndex] ?? [];
    gameState.minigameSubmissions[currentRoundIndex] = existing.filter(s => s.playerId !== playerId);
    gameState.minigameSubmissions[currentRoundIndex].push(submission as OpenMinigameSubmission);

    const existingSubmissions = gameState.submissions[currentRoundIndex] ?? [];
    gameState.submissions[currentRoundIndex] = existingSubmissions.filter((sub: RoundSubmission) => sub.playerId !== playerId);
    const submissionId = `minigame_${playerId}_${currentRoundIndex}`;

    const placeholderSubmission: RoundSubmission = {
        id: submissionId,
        playerId,
        roundIndex: currentRoundIndex,
        placements: [],
        submittedAt: now,
    };
    gameState.submissions[currentRoundIndex].push(placeholderSubmission);

    return {stateChanged: true, events: [{type: "submission-submitted", playerId, submissionId}]};
}

/**
 * "end-round-early": BUILDING → VOTING (or RESULTS if ≤1 submissions).
 */
export function endBuildingPhaseEarly(
    state: SessionState,
    config: GameConfig,
    now: number,
): HandlerResult {
    if (!asBuildingPhase(state.gameState)) {
        return noChange;
    }

    if (shouldSkipVoting(state.gameState)) {
        const roundSubmissions = state.gameState.submissions[state.gameState.currentRoundIndex] ?? [];
        if (roundSubmissions.length === 0) {
            state.gameState.phaseState = {phase: "LOBBY"};
            return {stateChanged: true, events: []};
        }
        transitionToVoting(state, now);
        transitionToResults(state, now);
        return buildResultsEvents(state);
    }

    transitionToVoting(state, now);

    const {phaseState} = state.gameState;
    if (phaseState.phase !== "VOTING") {
        return noChange;
    }

    return {stateChanged: true, events: [{type: "voting-started", votingEndsAt: phaseState.votingEndsAt}]};
}

// ─── VOTING ─────────────────────────────────────────────────────

/**
 * "cast-vote": vote for a submission.
 */
export function castVote(
    state: SessionState,
    playerId: string,
    submissionId: string,
    config: GameConfig,
): HandlerResult {
    const {gameState} = state;
    const votingPhase = asVotingPhase(gameState);
    if (!votingPhase) {
        return noChange;
    }

    const roundSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    const targetSubmission = roundSubmissions.find((sub: RoundSubmission) => sub.id === submissionId);
    if (!targetSubmission || targetSubmission.playerId === playerId) {
        return noChange;
    }

    const myVotes = votingPhase.currentVotes[playerId] ?? [];

    // Toggle: clicking an already-voted submission removes the vote
    if (myVotes.includes(submissionId)) {
        votingPhase.currentVotes[playerId] = myVotes.filter(v => v !== submissionId);
        return {stateChanged: true, events: [{type: "vote-unregistered", voterId: playerId, submissionId}]};
    }

    // At capacity: remove the oldest vote before adding the new one
    if (myVotes.length >= 1) {
        votingPhase.currentVotes[playerId] = [...myVotes.slice(1), submissionId];
        return {stateChanged: true, events: [{type: "vote-registered", voterId: playerId, submissionId}]};
    }

    // Add the new vote
    votingPhase.currentVotes[playerId] = [...myVotes, submissionId];
    return {stateChanged: true, events: [{type: "vote-registered", voterId: playerId, submissionId}]};
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

    transitionToResults(state, now);
    return buildResultsEvents(state);
}

function buildResultsEvents(state: SessionState): HandlerResult {
    const resultsPhase = asResultsPhase(state.gameState)!;

    return {
        stateChanged: true,
        events: [
            {type: "results-ready", winnerId: resultsPhase.winnerId, results: resultsPhase.lastVoteResults},
        ],
    };
}

// ─── RESULTS ────────────────────────────────────────────────────

/**
 * "ready-to-advance": any player pressing this immediately starts the next round.
 */
export function advanceToNextRound(
    state: SessionState,
    playerId: string,
    config: GameConfig,
    minigameConfig: MinigameConfig,
    now: number,
): HandlerResult {
    const resultsPhase = asResultsPhase(state.gameState);
    if (!resultsPhase) {
        return noChange;
    }
    if (resultsPhase.readyToAdvanceIds.includes(playerId)) {
        return noChange;
    }

    const roundSubmissions = state.gameState.submissions[state.gameState.currentRoundIndex] ?? [];
    if (roundSubmissions.length === 0) {
        state.gameState.phaseState = {phase: "LOBBY"};
        return {stateChanged: true, events: []};
    }

    resultsPhase.readyToAdvanceIds.push(playerId);
    transitionToNextRound(state, minigameConfig, now);

    const {gameState} = state;
    const {phaseState} = gameState;
    if (phaseState.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [{
            type: "round-started",
            roundIndex: gameState.currentRoundIndex,
            prompt: gameState.currentPrompt,
            endsAt: phaseState.roundEndsAt
        }],
    };
}

/**
 * "advance-from-results": board-triggered advance to the next round.
 */
export function boardAdvancesToNextRound(
    state: SessionState,
    config: GameConfig,
    minigameConfig: MinigameConfig,
    now: number,
): HandlerResult {
    if (!asResultsPhase(state.gameState)) {
        return noChange;
    }

    const roundSubmissions = state.gameState.submissions[state.gameState.currentRoundIndex] ?? [];
    if (roundSubmissions.length === 0) {
        state.gameState.phaseState = {phase: "LOBBY"};
        return {stateChanged: true, events: []};
    }

    transitionToNextRound(state, minigameConfig, now);

    const {gameState} = state;
    const {phaseState} = gameState;
    if (phaseState.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [{
            type: "round-started",
            roundIndex: gameState.currentRoundIndex,
            prompt: gameState.currentPrompt,
            endsAt: phaseState.roundEndsAt
        }],
    };
}
