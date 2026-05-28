import type {MinigameConfig, MinigameTask, RoundVoteResult, SessionState} from "@birthday/shared";
import {getMinigameHandler} from "../../../../minigames/registry.js";

function pickUnplayedTask(
    state: SessionState,
    minigameConfig: MinigameConfig,
): MinigameTask | null {
    const runnableTasks = minigameConfig.tasks.filter(task => getMinigameHandler(task.type) !== null);
    if (runnableTasks.length === 0) return null;

    const configuredTaskIds = new Set(runnableTasks.map(task => task.id));
    const playedTaskIds = (state.gameState.playedTaskIds ?? []).filter((taskId: string) => configuredTaskIds.has(taskId));
    const playedTaskIdSet = new Set(playedTaskIds);
    const unplayedTasks = runnableTasks.filter(task => !playedTaskIdSet.has(task.id));
    const candidateTasks = unplayedTasks.length > 0 ? unplayedTasks : runnableTasks;

    return candidateTasks[Math.floor(Math.random() * candidateTasks.length)] ?? null;
}

function pickNextTask(
    state: SessionState,
    minigameConfig: MinigameConfig,
    completedRoundIndex: number,
    nextRoundIndex: number,
): MinigameTask | null {
    const followUpTask = createFollowUpTask(state, completedRoundIndex, nextRoundIndex);
    return followUpTask ?? pickUnplayedTask(state, minigameConfig);
}

function createFollowUpTask(
    state: SessionState,
    completedRoundIndex: number,
    nextRoundIndex: number,
): MinigameTask | null {
    const currentTask = state.gameState.currentTask;
    const handler = currentTask ? getMinigameHandler(currentTask.type) : null;
    if (!currentTask || !handler?.createNextTaskAfterResults) return null;

    return handler.createNextTaskAfterResults({
        task: currentTask,
        submissions: state.gameState.minigameSubmissions[completedRoundIndex] ?? [],
        nextRoundIndex,
    });
}

function startRoundWithTask(
    state: SessionState,
    minigameConfig: MinigameConfig,
    now: number,
    task: MinigameTask | null,
    completedRoundIndex: number,
    nextRoundIndex: number,
): void {
    const {gameState} = state;

    gameState.currentRoundIndex = nextRoundIndex;
    gameState.roundStartedAt = now;

    gameState.currentTask = task;
    gameState.currentPrompt = task?.title ?? "Neue Runde";
    gameState.promptHistory[gameState.currentRoundIndex] = gameState.currentPrompt;
    if (task && minigameConfig.tasks.some(configTask => configTask.id === task.id)) {
        const configuredTaskIds = new Set(minigameConfig.tasks.map(configTask => configTask.id));
        const previousPlayedTaskIds = (gameState.playedTaskIds ?? []).filter((taskId: string) => configuredTaskIds.has(taskId));
        gameState.playedTaskIds = previousPlayedTaskIds.includes(task.id)
            ? [task.id]
            : [...previousPlayedTaskIds, task.id];
    }

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

export function transitionToRoundActive(
    state: SessionState,
    minigameConfig: MinigameConfig,
    now: number,
): void {
    const completedRoundIndex = state.gameState.currentRoundIndex;
    const nextRoundIndex = completedRoundIndex + 1;
    const task = pickNextTask(state, minigameConfig, completedRoundIndex, nextRoundIndex);

    startRoundWithTask(state, minigameConfig, now, task, completedRoundIndex, nextRoundIndex);
}

export function transitionToFollowUpRoundIfAvailable(
    state: SessionState,
    minigameConfig: MinigameConfig,
    now: number,
): boolean {
    if (state.gameState.phaseState.phase !== "ROUND_ACTIVE") return false;

    const completedRoundIndex = state.gameState.currentRoundIndex;
    const nextRoundIndex = completedRoundIndex + 1;
    const followUpTask = createFollowUpTask(state, completedRoundIndex, nextRoundIndex);
    if (!followUpTask) return false;

    startRoundWithTask(state, minigameConfig, now, followUpTask, completedRoundIndex, nextRoundIndex);
    return true;
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
