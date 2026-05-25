import type {
    SessionState, StickerCollageGameState, StickerCollageGameConfig, StickerCollage,
    StickerCollageVoteResult, StickerCollageResultsState,
} from "@birthday/shared";

function pickRandom<T>(arr: T[], count: number): T[] {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

function pickUnusedPrompt(config: StickerCollageGameConfig, gameState: StickerCollageGameState): string {
    const usedTexts = new Set(Object.values(gameState.promptHistory));
    const unusedPrompts = config.prompts.filter(p => !usedTexts.has(p.text));
    const pool = unusedPrompts.length > 0 ? unusedPrompts : config.prompts;
    return pickRandom(pool, 1)[0]?.text ?? config.prompts[0]?.text ?? "";
}

function setPrompt(gameState: StickerCollageGameState, config: StickerCollageGameConfig, promptText: string): void {
    gameState.currentPrompt = promptText;
    gameState.promptHistory[gameState.currentRoundIndex] = promptText;
    const pc = config.prompts.find(p => p.text === promptText);
    gameState.currentRecommendedPackIds = pc?.recommendedPackIds ?? [];
}

// ─── Phase transitions ──────────────────────────────────────────

function pickRandomTask(config: StickerCollageGameConfig): import("@birthday/shared").MinigameTask | null {
    if (config.tasks.length === 0) return null;
    return config.tasks[Math.floor(Math.random() * config.tasks.length)] ?? null;
}

export function transitionToBuilding(
    state: SessionState,
    config: StickerCollageGameConfig,
    now: number,
    chosenPrompt?: string,
): void {
    const {gameState} = state;

    gameState.currentRoundIndex += 1;
    gameState.roundStartedAt = now;
    setPrompt(gameState, config, chosenPrompt ?? pickUnusedPrompt(config, gameState));

    const task = pickRandomTask(config);
    gameState.currentTask = task;

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

/**
 * Returns true when voting should be skipped because there are
 * 0 or 1 submissions – nothing meaningful to vote on.
 */
export function shouldSkipVoting(gameState: StickerCollageGameState): boolean {
    const currentSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    const currentMinigames = gameState.minigameSubmissions[gameState.currentRoundIndex] ?? [];
    return (currentSubmissions.length + currentMinigames.length) <= 1;
}

/**
 * BUILDING → VOTING: end the building phase and open voting.
 */
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

/**
 * VOTING → RESULTS: tally votes, determine winner, prepare choices.
 */
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

    let lastVoteResults: StickerCollageVoteResult[] = [];
    let winnerId: string | null = null;

    let tiedWinnerIds: string[] = [];

    if (currentSubmissions.length > 0) {
        const voteCounts = new Map<string, number>();
        for (const collageIds of Object.values(currentVotes) as string[][]) {
            for (const collageId of collageIds) {
                voteCounts.set(collageId, (voteCounts.get(collageId) ?? 0) + 1);
            }
        }

        const ranked = currentSubmissions
            .map((sub: StickerCollage) => ({
                collageId: sub.id,
                playerId: sub.playerId,
                voteCount: voteCounts.get(sub.id) ?? 0,
            }))
            .sort((a, b) => b.voteCount - a.voteCount);

        // Compute tied placements: same voteCount → same placement
        let currentPlacement = 0;
        let prevVoteCount: number | undefined;
        lastVoteResults = ranked.map((entry, i): StickerCollageVoteResult => {
            if (entry.voteCount !== prevVoteCount) {
                currentPlacement = i + 1;
                prevVoteCount = entry.voteCount;
            }
            return {
                collageId: entry.collageId,
                playerId: entry.playerId,
                voteCount: entry.voteCount,
                placement: currentPlacement,
            };
        });

        // Winner: random pick among all players tied for first place
        const topVoteCount = ranked[0]?.voteCount ?? 0;
        const topPlayers = ranked.filter(e => e.voteCount === topVoteCount);
        winnerId = topPlayers[Math.floor(Math.random() * topPlayers.length)]?.playerId ?? null;
        tiedWinnerIds = topPlayers
            .filter(e => e.playerId !== winnerId)
            .map(e => e.playerId);
    }

    gameState.phaseState = {
        phase: "RESULTS",
        resultsEndsAt: now + config.resultsDurationSec * 1000,
        lastVoteResults,
        winnerId,
        tiedWinnerIds,
        readyToAdvanceIds: [],
        ...buildWinnerChoices(gameState, config, winnerId),
    };
}

function buildWinnerChoices(
    gameState: StickerCollageGameState,
    config: StickerCollageGameConfig,
    winnerId: string | null,
): Pick<StickerCollageResultsState, "promptChoices" | "packUnlockChoices" | "lastUnlockedPackId" | "winnerChoicesDone"> {
    const usedTexts = new Set(Object.values(gameState.promptHistory));
    const unusedPrompts = config.prompts.filter(p => !usedTexts.has(p.text));
    const promptPool = unusedPrompts.length >= config.promptChoiceCount ? unusedPrompts : config.prompts;
    const promptChoices = pickRandom(promptPool, config.promptChoiceCount).map(p => p.text);

    const lockedPacks = gameState.stickerPacks.filter(pack => !gameState.unlockedPackIds.includes(pack.id));
    const packUnlockChoices = pickRandom(lockedPacks, config.packUnlockChoiceCount).map(pack => pack.id);

    const hasLockedPacks = lockedPacks.length > 0;

    return {
        promptChoices,
        packUnlockChoices,
        lastUnlockedPackId: null,
        winnerChoicesDone: !winnerId || !hasLockedPacks,
    };
}

/**
 * RESULTS → BUILDING (next round): finalise winner choices and start building.
 */
export function transitionToNextRound(
    state: SessionState,
    config: StickerCollageGameConfig,
    now: number,
): void {
    const {gameState} = state;

    if (gameState.phaseState.phase !== "RESULTS") {
        return;
    }
    const {promptChoices} = gameState.phaseState;

    // Winner's pick → first available choice → random unused prompt
    const nextPrompt = gameState.promptHistory[gameState.currentRoundIndex + 1]
        ?? promptChoices[0]
        ?? pickUnusedPrompt(config, gameState);

    transitionToBuilding(state, config, now, nextPrompt);
}
