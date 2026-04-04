import type {SessionState, StickerCollageModeState, StickerCollageGameConfig, StickerCollage, StickerCollageVoteResult} from "@birthday/shared";

/**
 * Start a new round: increment index, pick next prompt, reset hands/votes, set timer.
 */
export function startNewRound(
    state: SessionState<StickerCollageModeState>,
    config: StickerCollageGameConfig,
    now: number,
): void {
    const ms = state.modeState;

    ms.currentRoundIndex += 1;
    ms.phase = "BUILDING";
    ms.roundStartedAt = now;
    ms.roundEndsAt = now + config.roundDurationSec * 1000;

    // Pick the next prompt (cycle if we run out)
    const promptIndex = (ms.currentRoundIndex - 1) % config.prompts.length;
    ms.currentPrompt = config.prompts[promptIndex];
    ms.promptHistory[ms.currentRoundIndex] = ms.currentPrompt;

    // Reset per-round data
    ms.playerHands = {};
    ms.currentVotes = {};

    // Submissions for this round will be created as players submit
    if (!ms.submissions[ms.currentRoundIndex]) {
        ms.submissions[ms.currentRoundIndex] = [];
    }
}

/**
 * End the current round: move to REVIEWING phase briefly, then tally votes.
 */
export function endRound(
    state: SessionState<StickerCollageModeState>,
    config: StickerCollageGameConfig,
    now: number,
): void {
    const ms = state.modeState;

    // Tally votes from current round for previous round's submissions
    const votingRoundIndex = ms.currentRoundIndex - 1;
    const previousSubmissions = ms.submissions[votingRoundIndex] ?? [];

    if (previousSubmissions.length > 0) {
        // Count votes per collage
        const voteCounts = new Map<string, number>();
        for (const collageIds of Object.values(ms.currentVotes) as string[][]) {
            for (const collageId of collageIds) {
                voteCounts.set(collageId, (voteCounts.get(collageId) ?? 0) + 1);
            }
        }

        // Rank by vote count
        const ranked: Array<{collageId: string; playerId: string; voteCount: number}> = previousSubmissions
            .map((c: StickerCollage) => ({collageId: c.id, playerId: c.playerId, voteCount: voteCounts.get(c.id) ?? 0}))
            .sort((a: {voteCount: number}, b: {voteCount: number}) => b.voteCount - a.voteCount);

        // Award points
        ms.lastVoteResults = ranked.map((entry: {collageId: string; playerId: string; voteCount: number}, index: number): StickerCollageVoteResult => {
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
    } else {
        ms.lastVoteResults = [];
    }

    // Transition: immediately start the next round
    startNewRound(state, config, now);
}

