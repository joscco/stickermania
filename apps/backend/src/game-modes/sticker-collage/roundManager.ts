import type {SessionState, StickerCollageModeState, StickerCollageGameConfig, StickerCollage, StickerCollageVoteResult} from "@birthday/shared";

/**
 * Pick N random items from an array without duplicates.
 */
function pickRandom<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// ─── Phase transitions ──────────────────────────────────────────

/**
 * LOBBY → BUILDING: Start a new round of building.
 * If chosenPrompt is provided (winner chose it), use it. Otherwise pick from config.
 */
export function startBuilding(
    state: SessionState<StickerCollageModeState>,
    config: StickerCollageGameConfig,
    now: number,
    chosenPrompt?: string,
): void {
    const ms = state.modeState;

    ms.currentRoundIndex += 1;
    ms.phase = "BUILDING";
    ms.roundStartedAt = now;
    ms.roundEndsAt = now + config.roundDurationSec * 1000;
    ms.votingEndsAt = null;
    ms.resultsEndsAt = null;

    // Pick prompt
    if (chosenPrompt) {
        ms.currentPrompt = chosenPrompt;
    } else {
        const promptIndex = (ms.currentRoundIndex - 1) % config.prompts.length;
        ms.currentPrompt = config.prompts[promptIndex];
    }
    ms.promptHistory[ms.currentRoundIndex] = ms.currentPrompt;

    // Reset per-round data
    ms.playerHands = {};
    ms.currentVotes = {};
    ms.skippedPlayerIds = [];
    ms.winnerId = null;
    ms.promptChoices = [];
    ms.packUnlockChoices = [];
    ms.guaranteedPackChoices = [];
    ms.lastUnlockedPackId = null;
    ms.winnerChoicesDone = false;

    if (!ms.submissions[ms.currentRoundIndex]) {
        ms.submissions[ms.currentRoundIndex] = [];
    }
}

/**
 * BUILDING → VOTING: End the building phase and start voting.
 */
export function startVoting(
    state: SessionState<StickerCollageModeState>,
    config: StickerCollageGameConfig,
    now: number,
): void {
    const ms = state.modeState;

    ms.phase = "VOTING";
    ms.roundEndsAt = null;
    ms.votingEndsAt = now + config.votingDurationSec * 1000;

    // Clear votes for fresh voting
    ms.currentVotes = {};
}

/**
 * VOTING → RESULTS: Tally votes, award points, determine winner, prepare choices.
 */
export function startResults(
    state: SessionState<StickerCollageModeState>,
    config: StickerCollageGameConfig,
    now: number,
): void {
    const ms = state.modeState;

    ms.phase = "RESULTS";
    ms.votingEndsAt = null;
    ms.resultsEndsAt = now + config.resultsDurationSec * 1000;

    // Tally votes for THIS round's submissions
    const currentSubmissions = ms.submissions[ms.currentRoundIndex] ?? [];

    if (currentSubmissions.length > 0) {
        const voteCounts = new Map<string, number>();
        for (const collageIds of Object.values(ms.currentVotes) as string[][]) {
            for (const collageId of collageIds) {
                voteCounts.set(collageId, (voteCounts.get(collageId) ?? 0) + 1);
            }
        }

        const ranked = currentSubmissions
            .map((c: StickerCollage) => ({
                collageId: c.id,
                playerId: c.playerId,
                voteCount: voteCounts.get(c.id) ?? 0,
            }))
            .sort((a, b) => b.voteCount - a.voteCount);

        ms.lastVoteResults = ranked.map((entry, index): StickerCollageVoteResult => {
            const points = index < config.pointsByPlacement.length ? config.pointsByPlacement[index] : 0;
            if (points > 0 && state.players[entry.playerId]) {
                state.players[entry.playerId].score += points;
            }
            return {
                collageId: entry.collageId,
                playerId: entry.playerId,
                voteCount: entry.voteCount,
                pointsAwarded: points,
            };
        });

        // Winner = first place (most votes)
        ms.winnerId = ranked.length > 0 ? ranked[0].playerId : null;
    } else {
        ms.lastVoteResults = [];
        ms.winnerId = null;
    }

    // Prepare choices for the winner
    prepareWinnerChoices(ms, config);
}

/**
 * Prepare the prompt, pack-unlock, and guaranteed-pack choices for the winner.
 */
function prepareWinnerChoices(
    ms: StickerCollageModeState,
    config: StickerCollageGameConfig,
): void {
    // Prompt choices: pick N random prompts not used in recent rounds
    const usedPrompts = new Set(Object.values(ms.promptHistory));
    const availablePrompts = config.prompts.filter(p => !usedPrompts.has(p));
    const promptPool = availablePrompts.length >= config.promptChoiceCount
        ? availablePrompts
        : config.prompts; // fallback to all if not enough unused
    ms.promptChoices = pickRandom(promptPool, config.promptChoiceCount);

    // Pack unlock choices: pick from locked packs
    const lockedPacks = ms.stickerPacks.filter(p => !ms.unlockedPackIds.includes(p.id));
    ms.packUnlockChoices = pickRandom(lockedPacks, config.packUnlockChoiceCount).map(p => p.id);

    // Guaranteed pack choices: all currently unlocked packs
    ms.guaranteedPackChoices = [...ms.unlockedPackIds];

    // If no locked packs remain, skip pack unlock step
    // If no winner, mark choices as done immediately
    if (!ms.winnerId) {
        ms.winnerChoicesDone = true;
    }
}

/**
 * RESULTS → NEXT_ROUND_SETUP → automatically goes to BUILDING.
 * Called when the winner (or board) has finalized choices, or on timeout.
 */
export function advanceFromResults(
    state: SessionState<StickerCollageModeState>,
    config: StickerCollageGameConfig,
    now: number,
): void {
    const ms = state.modeState;

    ms.phase = "NEXT_ROUND_SETUP";
    ms.resultsEndsAt = null;

    // Auto-pick defaults for anything the winner didn't choose
    if (!ms.winnerChoicesDone) {
        if (ms.promptChoices.length > 0 && !ms.promptHistory[ms.currentRoundIndex + 1]) {
            // Will be used as the next prompt
        }
        ms.winnerChoicesDone = true;
    }

    // Determine next prompt
    const nextPrompt = ms.promptHistory[ms.currentRoundIndex + 1]
        ?? ms.promptChoices[0]
        ?? config.prompts[(ms.currentRoundIndex) % config.prompts.length];

    // Clear guaranteed pack after use (it applies only to the next round)
    // guaranteedPackId is already set if the winner chose it

    // Start building the next round
    startBuilding(state, config, now, nextPrompt);
}
