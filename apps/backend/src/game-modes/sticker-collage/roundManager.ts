import type {
    SessionState, StickerCollageGameState, StickerCollageGameConfig, StickerCollage,
    StickerCollageVoteResult, StickerCollageResultsState, MinigameConfig, MinigameSubmission,
} from "@birthday/shared";

function pickRandomTask(minigameConfig: MinigameConfig): import("@birthday/shared").MinigameTask | null {
    if (minigameConfig.tasks.length === 0) return null;
    return minigameConfig.tasks[Math.floor(Math.random() * minigameConfig.tasks.length)] ?? null;
}

export function transitionToBuilding(
    state: SessionState,
    config: StickerCollageGameConfig,
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
        roundEndsAt: now + (task?.durationSec ?? config.roundDurationSec) * 1000,
        skippedPlayerIds: [],
    };
}

export function shouldSkipVoting(gameState: StickerCollageGameState): boolean {
    const currentSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    const currentMinigames = gameState.minigameSubmissions[gameState.currentRoundIndex] ?? [];
    if ((currentSubmissions.length + currentMinigames.length) <= 1) return true;

    // Only drawing and text-answer need voting
    const task = gameState.currentTask;
    if (task && task.type !== "drawing" && task.type !== "text-answer") {
        return true;
    }
    return false;
}

export function transitionToVoting(
    state: SessionState,
    config: StickerCollageGameConfig,
    now: number,
): void {
    state.gameState.phaseState = {
        phase: "VOTING",
        votingEndsAt: now + config.votingDurationSec * 1000,
        currentVotes: {},
        doneVotingIds: [],
    };
}

export function transitionToResults(
    state: SessionState,
    config: StickerCollageGameConfig,
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
    const useVoting = !task || task.type === "drawing" || task.type === "text-answer";

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
    } else if (currentMinigames.length > 0 && task) {
        const scored = computeMinigameResults(currentMinigames, currentSubmissions, task);
        lastVoteResults = scored.results;
        winnerId = scored.winnerId;
        tiedWinnerIds = scored.tiedWinnerIds;
    }

    gameState.phaseState = {
        phase: "RESULTS",
        resultsEndsAt: now + config.resultsDurationSec * 1000,
        lastVoteResults,
        winnerId,
        tiedWinnerIds,
        readyToAdvanceIds: [],
        promptChoices: [],
        packUnlockChoices: [],
        lastUnlockedPackId: null,
        winnerChoicesDone: true,
    };
}

function computeMinigameResults(
    submissions: MinigameSubmission[],
    collages: StickerCollage[],
    task: import("@birthday/shared").MinigameTask,
): { results: StickerCollageVoteResult[]; winnerId: string | null; tiedWinnerIds: string[] } {
    const collageMap = new Map(collages.map(c => [c.playerId, c]));
    interface Scored { playerId: string; score: number; collageId: string }
    let scored: Scored[] = [];

    switch (task.type) {
        case "thesis": {
            const total = submissions.length;
            const agreedCount = submissions.filter(s => s.type === "thesis" && (s as any).agreed).length;
            const actualPercent = total > 0 ? (agreedCount / total) * 100 : 50;
            for (const s of submissions) {
                if (s.type !== "thesis") continue;
                const th = s as import("@birthday/shared").ThesisSubmission;
                const c = collageMap.get(s.playerId);
                scored.push({ playerId: s.playerId, score: Math.abs(th.estimatedPercent - actualPercent), collageId: c?.id ?? "" });
            }
            scored.sort((a, b) => a.score - b.score);
            break;
        }
        case "number": {
            const values = submissions.filter(s => s.type === "number").map(s => (s as any).value as number);
            const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            for (const s of submissions) {
                if (s.type !== "number") continue;
                const num = s as import("@birthday/shared").NumberSubmission;
                const c = collageMap.get(s.playerId);
                scored.push({ playerId: s.playerId, score: Math.abs(num.value - avg), collageId: c?.id ?? "" });
            }
            scored.sort((a, b) => a.score - b.score);
            break;
        }
        case "timer-stop": {
            const target = (task as any).targetSec ?? 5;
            for (const s of submissions) {
                if (s.type !== "timer-stop") continue;
                const t = s as import("@birthday/shared").TimerStopSubmission;
                const c = collageMap.get(s.playerId);
                scored.push({ playerId: s.playerId, score: Math.abs(t.elapsedSec - target), collageId: c?.id ?? "" });
            }
            scored.sort((a, b) => a.score - b.score);
            break;
        }
        case "shape-split": {
            const target = (task as any).targetFraction ?? 0.5;
            for (const s of submissions) {
                if (s.type !== "shape-split") continue;
                const sp = s as import("@birthday/shared").ShapeSplitSubmission;
                const c = collageMap.get(s.playerId);
                scored.push({ playerId: s.playerId, score: Math.abs(sp.areaFraction - target), collageId: c?.id ?? "" });
            }
            scored.sort((a, b) => a.score - b.score);
            break;
        }
        case "sticker-place": {
            const goal = (task as any).goal;
            const furthest = goal === "furthest-from-average";
            const posBySticker = new Map<string, Array<{playerId: string; x: number; y: number}>>();
            for (const s of submissions) {
                if (s.type !== "sticker-place") continue;
                const sp = s as import("@birthday/shared").StickerPlaceSubmission;
                for (const p of sp.positions) {
                    if (!posBySticker.has(p.stickerId)) posBySticker.set(p.stickerId, []);
                    posBySticker.get(p.stickerId)!.push({ playerId: s.playerId, x: p.x, y: p.y });
                }
            }
            const playerScores = new Map<string, number>();
            for (const [, positions] of posBySticker) {
                const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
                const avgY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
                for (const p of positions) {
                    const dist = Math.hypot(p.x - avgX, p.y - avgY);
                    playerScores.set(p.playerId, (playerScores.get(p.playerId) ?? 0) + dist);
                }
            }
            for (const [playerId, dist] of playerScores) {
                const c = collageMap.get(playerId);
                scored.push({ playerId, score: dist, collageId: c?.id ?? "" });
            }
            scored.sort((a, b) => furthest ? b.score - a.score : a.score - b.score);
            break;
        }
        case "choice": {
            const optionCounts = new Map<number, number>();
            const playerChoices = new Map<string, number[]>();
            for (const s of submissions) {
                if (s.type !== "choice") continue;
                const ch = s as import("@birthday/shared").ChoiceSubmission;
                playerChoices.set(s.playerId, ch.selectedIndices);
                for (const idx of ch.selectedIndices) {
                    optionCounts.set(idx, (optionCounts.get(idx) ?? 0) + 1);
                }
            }
            let bestOption = -1, bestCount = -1;
            for (const [opt, count] of optionCounts) {
                if (count > bestCount) { bestCount = count; bestOption = opt; }
            }
            for (const [playerId, choices] of playerChoices) {
                const c = collageMap.get(playerId);
                scored.push({ playerId, score: choices.includes(bestOption) ? 0 : 1, collageId: c?.id ?? "" });
            }
            scored.sort((a, b) => a.score - b.score);
            break;
        }
    }

    if (scored.length === 0) return { results: [], winnerId: null, tiedWinnerIds: [] };

    const results: StickerCollageVoteResult[] = [];
    let placement = 1;
    for (let i = 0; i < scored.length; i++) {
        if (i > 0 && scored[i].score !== scored[i - 1].score) placement = i + 1;
        results.push({ collageId: scored[i].collageId, playerId: scored[i].playerId, voteCount: 0, placement });
    }

    const bestScore = scored[0].score;
    const topPlayers = scored.filter(s => s.score === bestScore);
    const winnerId = topPlayers[Math.floor(Math.random() * topPlayers.length)]?.playerId ?? null;
    const tiedWinnerIds = topPlayers.filter(s => s.playerId !== winnerId).map(s => s.playerId);

    return { results, winnerId, tiedWinnerIds };
}

export function transitionToNextRound(
    state: SessionState,
    config: StickerCollageGameConfig,
    minigameConfig: MinigameConfig,
    now: number,
): void {
    const {gameState} = state;

    if (gameState.phaseState.phase !== "RESULTS") {
        return;
    }

    transitionToBuilding(state, config, minigameConfig, now);
}
