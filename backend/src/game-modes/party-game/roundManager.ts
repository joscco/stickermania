import type {MinigameConfig, RoundVoteResult, SessionState} from "@birthday/shared";
import {getMinigameHandler} from "../../../../minigames/registry.js";

function pickRandomTask(minigameConfig: MinigameConfig): import("@birthday/shared").MinigameTask | null {
    const runnableTasks = minigameConfig.tasks.filter(task => getMinigameHandler(task.type) !== null);
    if (runnableTasks.length === 0) return null;
    return runnableTasks[Math.floor(Math.random() * runnableTasks.length)] ?? null;
}

function pickNextTask(
    state: SessionState,
    minigameConfig: MinigameConfig,
): import("@birthday/shared").MinigameTask | null {
    const currentTask = state.gameState.currentTask;
    const handler = currentTask ? getMinigameHandler(currentTask.type) : null;
    const currentSubmissions = state.gameState.minigameSubmissions[state.gameState.currentRoundIndex] ?? [];
    const followUpTask = handler?.createNextTaskAfterResults?.({
        task: currentTask!,
        submissions: currentSubmissions,
        nextRoundIndex: state.gameState.currentRoundIndex + 1,
    });

    return followUpTask ?? pickRandomTask(minigameConfig);
}

export function transitionToRoundActive(
    state: SessionState,
    minigameConfig: MinigameConfig,
    now: number,
): void {
    const {gameState} = state;

    gameState.currentRoundIndex += 1;
    gameState.roundStartedAt = now;

    const task = pickNextTask(state, minigameConfig);
    gameState.currentTask = task;
    gameState.currentPrompt = task?.title ?? "Neue Runde";
    gameState.promptHistory[gameState.currentRoundIndex] = gameState.currentPrompt;

    gameState.roundParticipantIds = Object.values(state.players)
        .filter(player => player.connected)
        .map(player => player.id);

    if (!gameState.submissions[gameState.currentRoundIndex]) {
        gameState.submissions[gameState.currentRoundIndex] = [];
    }
    if (!gameState.minigameSubmissions[gameState.currentRoundIndex]) {
        gameState.minigameSubmissions[gameState.currentRoundIndex] = [];
    }

    gameState.phaseState = {
        phase: "ROUND_ACTIVE",
        roundEndsAt: now + (task?.durationSec ?? 60) * 1000,
        skippedPlayerIds: [],
    };
}

export function transitionToRoundResults(
    state: SessionState,
    now: number,
): void {
    const {gameState} = state;

    if (gameState.phaseState.phase !== "ROUND_ACTIVE") {
        return;
    }

    const task = gameState.currentTask;
    const handler = task ? getMinigameHandler(task.type) : null;
    const currentMinigames = gameState.minigameSubmissions[gameState.currentRoundIndex] ?? [];

    let lastResults: RoundVoteResult[] = [];
    let winnerId: string | null = null;
    let tiedWinnerIds: string[] = [];

    if (task && handler && currentMinigames.length > 0) {
        const scored = handler.evaluateSubmissions({task, submissions: currentMinigames});
        lastResults = scored.voteResults;
        winnerId = scored.winnerId;
        tiedWinnerIds = scored.tiedWinnerIds;
    }

    gameState.phaseState = {
        phase: "ROUND_RESULTS",
        resultsEndsAt: now + gameState.resultsDurationSec * 1000,
        lastResults,
        winnerId,
        tiedWinnerIds,
        readyToAdvanceIds: [],
    };
}

export function transitionToNextRound(
    state: SessionState,
    minigameConfig: MinigameConfig,
    now: number,
): void {
    if (state.gameState.phaseState.phase !== "ROUND_RESULTS") {
        return;
    }

    transitionToRoundActive(state, minigameConfig, now);
}
