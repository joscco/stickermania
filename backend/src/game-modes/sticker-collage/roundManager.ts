import type {MinigameConfig, SessionState, StickerCollage, StickerCollageGameState, StickerCollageVoteResult,} from "@birthday/shared";
import {getMinigameHandler} from "./minigameHandlers.js";

function pickRandomTask(minigameConfig: MinigameConfig): import("@birthday/shared").MinigameTask | null {
    if (minigameConfig.tasks.length === 0) return null;
    return minigameConfig.tasks[Math.floor(Math.random() * minigameConfig.tasks.length)] ?? null;
}

export function transitionToBuilding(
    state: SessionState,
    minigameConfig: MinigameConfig,
    now: number,
    _chosenPrompt?: string,
): void {
    const {gameState} = state;

    gameState.currentRoundIndex += 1;
    gameState.roundStartedAt = now;

    const task = pickRandomTask(minigameConfig);
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
        phase: "BUILDING",
        roundEndsAt: now + (task?.durationSec ?? 60) * 1000,
        skippedPlayerIds: [],
    };
}

export function shouldSkipVoting(gameState: StickerCollageGameState): boolean {
    const currentSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    const currentMinigames = gameState.minigameSubmissions[gameState.currentRoundIndex] ?? [];
    if ((currentSubmissions.length + currentMinigames.length) <= 1) return true;

    const task = gameState.currentTask;
    if (task) {
        const handler = getMinigameHandler(task.type);
        if (handler && handler.requiresVoting(task)) return false;
        return true;
    }
    return false;
}

export function transitionToVoting(
    state: SessionState,
    now: number,
): void {
    state.gameState.phaseState = {
        phase: "VOTING",
        votingEndsAt: now + 60 * 1000,
        currentVotes: {},
        doneVotingIds: [],
    };
}

export function transitionToResults(
    state: SessionState,
    now: number,
): void {
    const {gameState} = state;

    if (gameState.phaseState.phase !== "VOTING") {
        return;
    }
    const {currentVotes} = gameState.phaseState;
    const currentSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    const currentMinigames = gameState.minigameSubmissions[gameState.currentRoundIndex] ?? [];

    let lastVoteResults: StickerCollageVoteResult[] = [];
    let winnerId: string | null = null;
    let tiedWinnerIds: string[] = [];

    const task = gameState.currentTask;
    const handler = task ? getMinigameHandler(task.type) : undefined;
    const useVoting = !task || (handler ? handler.requiresVoting(task) : false);

    if (useVoting && currentSubmissions.length > 0) {
        const voteCounts = new Map<string, number>();
        for (const collageIds of Object.values(currentVotes) as string[][]) {
            for (const collageId of collageIds) {
                voteCounts.set(collageId, (voteCounts.get(collageId) ?? 0) + 1);
            }
        }

        const ranked = currentSubmissions
            .map((sub: StickerCollage) => ({ collageId: sub.id, playerId: sub.playerId, voteCount: voteCounts.get(sub.id) ?? 0 }))
            .sort((a, b) => b.voteCount - a.voteCount);

        let currentPlacement = 0;
        let prevVoteCount: number | undefined;
        lastVoteResults = ranked.map((entry, i): StickerCollageVoteResult => {
            if (entry.voteCount !== prevVoteCount) { currentPlacement = i + 1; prevVoteCount = entry.voteCount; }
            return { collageId: entry.collageId, playerId: entry.playerId, voteCount: entry.voteCount, placement: currentPlacement };
        });

        const topVoteCount = ranked[0]?.voteCount ?? 0;
        const topPlayers = ranked.filter(e => e.voteCount === topVoteCount);
        winnerId = topPlayers[Math.floor(Math.random() * topPlayers.length)]?.playerId ?? null;
        tiedWinnerIds = topPlayers.filter(e => e.playerId !== winnerId).map(e => e.playerId);
    } else if (currentMinigames.length > 0 && task && handler) {
        const scored = handler.evaluateSubmissions({task, submissions: currentMinigames});
        lastVoteResults = scored.voteResults;
        winnerId = scored.winnerId;
        tiedWinnerIds = scored.tiedWinnerIds;
    }

    gameState.phaseState = {
        phase: "RESULTS",
        resultsEndsAt: now + 60 * 1000,
        lastVoteResults,
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
    const {gameState} = state;

    if (gameState.phaseState.phase !== "RESULTS") {
        return;
    }

    transitionToBuilding(state, minigameConfig, now);
}
