import type {
    GameConfig,
    MinigameClientAction,
    MinigameConfig,
    OpenMinigameSubmission,
    PartyGameServerEvent,
    PartyGameState,
    PartyRoundActiveState,
    PartyRoundResultsState,
    RoundSubmission,
    SessionState,
} from "@birthday/shared";
import {getMinigameHandler} from "../../../../minigames/registry.js";
import {transitionToNextRound, transitionToRoundActive, transitionToRoundResults} from "./roundManager.js";

type HandlerResult = { stateChanged: boolean; events: PartyGameServerEvent[] };
const noChange: HandlerResult = {stateChanged: false, events: []};

function asRoundActivePhase(gameState: PartyGameState): PartyRoundActiveState | null {
    return gameState.phaseState.phase === "ROUND_ACTIVE" ? gameState.phaseState : null;
}

function asRoundResultsPhase(gameState: PartyGameState): PartyRoundResultsState | null {
    return gameState.phaseState.phase === "ROUND_RESULTS" ? gameState.phaseState : null;
}

export function startGame(
    state: SessionState,
    _config: GameConfig,
    minigameConfig: MinigameConfig,
    now: number,
): HandlerResult {
    if (state.gameState.phaseState.phase !== "LOBBY") {
        return noChange;
    }

    transitionToRoundActive(state, minigameConfig, now);

    const {gameState} = state;
    const activePhase = gameState.phaseState;
    if (activePhase.phase !== "ROUND_ACTIVE") {
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
                endsAt: activePhase.roundEndsAt,
            },
        ],
    };
}

export function skipRound(
    state: SessionState,
    playerId: string,
): HandlerResult {
    const activePhase = asRoundActivePhase(state.gameState);
    if (!activePhase) {
        return noChange;
    }
    if (activePhase.skippedPlayerIds.includes(playerId)) {
        return noChange;
    }

    activePhase.skippedPlayerIds.push(playerId);
    return {stateChanged: true, events: []};
}

export function submitMinigame(
    state: SessionState,
    playerId: string,
    action: MinigameClientAction,
    now: number,
): HandlerResult {
    const activePhase = asRoundActivePhase(state.gameState);
    if (!activePhase) {
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

    const existingMinigames = gameState.minigameSubmissions[currentRoundIndex] ?? [];
    gameState.minigameSubmissions[currentRoundIndex] = existingMinigames.filter(s => s.playerId !== playerId);
    gameState.minigameSubmissions[currentRoundIndex].push(submission as OpenMinigameSubmission);

    const existingSubmissions = gameState.submissions[currentRoundIndex] ?? [];
    gameState.submissions[currentRoundIndex] = existingSubmissions.filter((sub: RoundSubmission) => sub.playerId !== playerId);

    const submissionId = `minigame_${playerId}_${currentRoundIndex}`;
    gameState.submissions[currentRoundIndex].push({
        id: submissionId,
        playerId,
        roundIndex: currentRoundIndex,
        placements: [],
        submittedAt: now,
    });

    return {stateChanged: true, events: [{type: "submission-submitted", playerId, submissionId}]};
}

export function endRoundEarly(
    state: SessionState,
    _config: GameConfig,
    now: number,
): HandlerResult {
    if (!asRoundActivePhase(state.gameState)) {
        return noChange;
    }

    const roundSubmissions = state.gameState.submissions[state.gameState.currentRoundIndex] ?? [];
    if (roundSubmissions.length === 0) {
        state.gameState.phaseState = {phase: "LOBBY"};
        return {stateChanged: true, events: []};
    }

    transitionToRoundResults(state, now);
    return buildResultsEvents(state);
}

function buildResultsEvents(state: SessionState): HandlerResult {
    const resultsPhase = asRoundResultsPhase(state.gameState);
    if (!resultsPhase) return noChange;

    return {
        stateChanged: true,
        events: [
            {type: "results-ready", winnerId: resultsPhase.winnerId, results: resultsPhase.lastResults},
        ],
    };
}

export function advanceToNextRound(
    state: SessionState,
    playerId: string,
    _config: GameConfig,
    minigameConfig: MinigameConfig,
    now: number,
): HandlerResult {
    const resultsPhase = asRoundResultsPhase(state.gameState);
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

    return buildRoundStartedEvents(state);
}

export function boardAdvancesToNextRound(
    state: SessionState,
    _config: GameConfig,
    minigameConfig: MinigameConfig,
    now: number,
): HandlerResult {
    if (!asRoundResultsPhase(state.gameState)) {
        return noChange;
    }

    const roundSubmissions = state.gameState.submissions[state.gameState.currentRoundIndex] ?? [];
    if (roundSubmissions.length === 0) {
        state.gameState.phaseState = {phase: "LOBBY"};
        return {stateChanged: true, events: []};
    }

    transitionToNextRound(state, minigameConfig, now);

    return buildRoundStartedEvents(state);
}

function buildRoundStartedEvents(state: SessionState): HandlerResult {
    const {gameState} = state;
    const {phaseState} = gameState;
    if (phaseState.phase !== "ROUND_ACTIVE") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [{
            type: "round-started",
            roundIndex: gameState.currentRoundIndex,
            prompt: gameState.currentPrompt,
            endsAt: phaseState.roundEndsAt,
        }],
    };
}
