import type {
    SessionState, StickerCollageGameState, StickerCollageGameConfig, StickerCollage,
    StickerCollageVoteResult, StickerCollageResultsState,
} from "@birthday/shared";
import {dealHand} from "./stickerCatalog.js";

function pickRandom<T>(arr: T[], count: number): T[] {
    return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

function pickUnusedPrompt(config: StickerCollageGameConfig, gameState: StickerCollageGameState): string {
    const usedPrompts = new Set(Object.values(gameState.promptHistory));
    const unusedPrompts = config.prompts.filter(prompt => !usedPrompts.has(prompt));
    const pool = unusedPrompts.length > 0 ? unusedPrompts : config.prompts;
    return pickRandom(pool, 1)[0] ?? config.prompts[0];
}

// ─── Phase transitions ──────────────────────────────────────────

/**
 * LOBBY / RESULTS → BUILDING: start the next round.
 * If chosenPrompt is provided (winner chose it), use it; otherwise pick from config.
 */
export function transitionToBuilding(
    state: SessionState,
    config: StickerCollageGameConfig,
    now: number,
    chosenPrompt?: string,
): void {
    const {gameState} = state;

    gameState.currentRoundIndex += 1;
    gameState.roundStartedAt = now;
    gameState.currentPrompt = chosenPrompt ?? pickUnusedPrompt(config, gameState);
    gameState.promptHistory[gameState.currentRoundIndex] = gameState.currentPrompt;

    gameState.roundParticipantIds = Object.values(state.players)
        .filter(player => player.connected)
        .map(player => player.id);

    if (!gameState.submissions[gameState.currentRoundIndex]) {
        gameState.submissions[gameState.currentRoundIndex] = [];
    }

    const playerHands: Record<string, {stickerIds: string[]}> = {};
    for (const playerId of gameState.roundParticipantIds) {
        playerHands[playerId] = dealHand(
            gameState.stickerCatalog,
            config,
            gameState.unlockedPackIds,
            gameState.guaranteedPackId,
            gameState.stickerPacks,
        );
    }

    gameState.phaseState = {
        phase: "BUILDING",
        roundEndsAt: now + config.roundDurationSec * 1000,
        playerHands,
        skippedPlayerIds: [],
    };
}

/**
 * Returns true when voting should be skipped because there are
 * 0 or 1 submissions – nothing meaningful to vote on.
 */
export function shouldSkipVoting(gameState: StickerCollageGameState): boolean {
    const currentSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    return currentSubmissions.length <= 1;
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

        lastVoteResults = ranked.map((entry): StickerCollageVoteResult => ({
            collageId: entry.collageId,
            playerId: entry.playerId,
            voteCount: entry.voteCount,
        }));

        // Winner: random pick among all players tied for first place
        const topVoteCount = ranked[0]?.voteCount ?? 0;
        const topPlayers = ranked.filter(e => e.voteCount === topVoteCount);
        winnerId = topPlayers[Math.floor(Math.random() * topPlayers.length)]?.playerId ?? null;
    }

    gameState.phaseState = {
        phase: "RESULTS",
        resultsEndsAt: now + config.resultsDurationSec * 1000,
        lastVoteResults,
        winnerId,
        readyToAdvanceIds: [],
        ...buildWinnerChoices(gameState, config, winnerId),
    };
}

function buildWinnerChoices(
    gameState: StickerCollageGameState,
    config: StickerCollageGameConfig,
    winnerId: string | null,
): Pick<StickerCollageResultsState, "promptChoices" | "packUnlockChoices" | "guaranteedPackChoices" | "lastUnlockedPackId" | "winnerChoicesDone"> {
    const usedPrompts = new Set(Object.values(gameState.promptHistory));
    const unusedPrompts = config.prompts.filter(prompt => !usedPrompts.has(prompt));
    const promptPool = unusedPrompts.length >= config.promptChoiceCount ? unusedPrompts : config.prompts;
    const promptChoices = pickRandom(promptPool, config.promptChoiceCount);

    const lockedPacks = gameState.stickerPacks.filter(pack => !gameState.unlockedPackIds.includes(pack.id));
    const packUnlockChoices = pickRandom(lockedPacks, config.packUnlockChoiceCount).map(pack => pack.id);
    const guaranteedPackChoices = [...gameState.unlockedPackIds];

    return {
        promptChoices,
        packUnlockChoices,
        guaranteedPackChoices,
        lastUnlockedPackId: null,
        winnerChoicesDone: !winnerId,
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
