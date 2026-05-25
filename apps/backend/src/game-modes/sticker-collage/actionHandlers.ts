import crypto from "node:crypto";
import type {GameConfig, SessionState, StickerCollage, StickerCollageBuildingState, StickerCollageGameState, StickerCollageResultsState, StickerCollageServerEvent, StickerCollageVotingState, StickerPlacement, MinigameClientAction, MinigameSubmission, MinigameConfig,} from "@birthday/shared";
import {shouldSkipVoting, transitionToBuilding, transitionToNextRound, transitionToResults, transitionToVoting} from "./roundManager.js";

// ─── Helpers ────────────────────────────────────────────────────

type HandlerResult = {stateChanged: boolean; events: StickerCollageServerEvent[]};
const noChange: HandlerResult = {stateChanged: false, events: []};

function asBuildingPhase(gameState: StickerCollageGameState): StickerCollageBuildingState | null {
    return gameState.phaseState.phase === "BUILDING" ? gameState.phaseState : null;
}

function asVotingPhase(gameState: StickerCollageGameState): StickerCollageVotingState | null {
    return gameState.phaseState.phase === "VOTING" ? gameState.phaseState : null;
}

function asResultsPhase(gameState: StickerCollageGameState): StickerCollageResultsState | null {
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

    transitionToBuilding(state, config.stickerCollage, minigameConfig, now);

    const {gameState} = state;
    const buildingPhase = gameState.phaseState;
    if (buildingPhase.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [
            {type: "game-started"},
            {type: "round-started", roundIndex: gameState.currentRoundIndex, prompt: gameState.currentPrompt, endsAt: buildingPhase.roundEndsAt},
        ],
    };
}

// ─── BUILDING ───────────────────────────────────────────────────

/**
 * "submit-collage": save a player's collage for the current round.
 */
export function submitCollage(
    state: SessionState,
    playerId: string,
    placements: StickerPlacement[],
    config: GameConfig,
    now: number,
): HandlerResult {
    const {gameState} = state;
    const buildingPhase = asBuildingPhase(gameState);
    if (!buildingPhase) {
        return noChange;
    }

    if (placements.length > config.stickerCollage.maxStickersOnCanvas) {
        return noChange;
    }

    const {currentRoundIndex} = gameState;
    const existingSubmissions = gameState.submissions[currentRoundIndex] ?? [];
    gameState.submissions[currentRoundIndex] = existingSubmissions.filter((sub: StickerCollage) => sub.playerId !== playerId);

    const collageId = `collage_${playerId}_${currentRoundIndex}_${crypto.randomUUID().slice(0, 6)}`;
    const collage: StickerCollage = {id: collageId, playerId, roundIndex: currentRoundIndex, placements, submittedAt: now};
    gameState.submissions[currentRoundIndex].push(collage);

    return {stateChanged: true, events: [{type: "collage-submitted", playerId, collageId}]};
}

/**
 * "skip-round": mark the player as skipping (no collage this round).
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
    const existing = gameState.minigameSubmissions[currentRoundIndex] ?? [];
    gameState.minigameSubmissions[currentRoundIndex] = existing.filter(s => s.playerId !== playerId);

    let submission: MinigameSubmission;
    switch (action.type) {
        case "submit-sticker-place":
            submission = {
                type: "sticker-place",
                playerId,
                roundIndex: currentRoundIndex,
                positions: action.positions,
                submittedAt: now,
            };
            break;
        case "submit-drawing":
            submission = {
                type: "drawing",
                playerId,
                roundIndex: currentRoundIndex,
                imageDataUrl: action.imageDataUrl,
                submittedAt: now,
            };
            break;
        case "submit-choice":
            submission = {
                type: "choice",
                playerId,
                roundIndex: currentRoundIndex,
                selectedIndices: action.selectedIndices,
                submittedAt: now,
            };
            break;
        case "submit-number":
            submission = {
                type: "number",
                playerId,
                roundIndex: currentRoundIndex,
                value: action.value,
                submittedAt: now,
            };
            break;
        case "submit-timer":
            submission = {
                type: "timer-stop",
                playerId,
                roundIndex: currentRoundIndex,
                elapsedSec: action.elapsedSec,
                submittedAt: now,
            };
            break;
        case "submit-shape-split":
            submission = {
                type: "shape-split",
                playerId,
                roundIndex: currentRoundIndex,
                cutLine: action.cutLine,
                areaFraction: action.areaFraction,
                submittedAt: now,
            };
            break;
        case "submit-text-answer":
            submission = {
                type: "text-answer",
                playerId,
                roundIndex: currentRoundIndex,
                answer: action.answer,
                submittedAt: now,
            };
            break;
        case "submit-thesis":
            submission = {
                type: "thesis",
                playerId,
                roundIndex: currentRoundIndex,
                agreed: action.agreed,
                estimatedPercent: action.estimatedPercent,
                submittedAt: now,
            };
            break;
        default:
            return noChange;
    }

    gameState.minigameSubmissions[currentRoundIndex].push(submission);

    // Compatibility: also create a placeholder collage so existing voting/results logic works
    const existingCollages = gameState.submissions[currentRoundIndex] ?? [];
    gameState.submissions[currentRoundIndex] = existingCollages.filter((sub: StickerCollage) => sub.playerId !== playerId);
    const collageId = `minigame_${playerId}_${currentRoundIndex}`;

    let snapshotUrl: string | undefined;
    if (submission.type === "drawing") {
        snapshotUrl = submission.imageDataUrl;
    } else if (submission.type === "sticker-place") {
        const dots = submission.positions.map(p =>
            `<circle cx="${p.x * 2}" cy="${p.y * 2}" r="8" fill="black"/>`
        ).join('');
        snapshotUrl = `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${dots}</svg>`
        )}`;
    } else if (submission.type === "shape-split") {
        const {cutLine, areaFraction} = submission;
        const pct = Math.round(areaFraction * 100);
        snapshotUrl = `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f5f5f5"/><line x1="${cutLine.a.x}" y1="${cutLine.a.y}" x2="${cutLine.b.x}" y2="${cutLine.b.y}" stroke="black" stroke-width="2"/><text x="100" y="110" text-anchor="middle" font-size="20" font-family="sans-serif">${pct}%</text></svg>`
        )}`;
    } else if (submission.type === "text-answer") {
        const safe = submission.answer.replace(/</g, '&lt;').replace(/>/g, '&gt;').substring(0, 40);
        snapshotUrl = `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#f5f5f5"/><text x="100" y="45" text-anchor="middle" font-size="14" font-family="sans-serif" fill="black">${safe}</text></svg>`
        )}`;
    } else if (submission.type === "thesis") {
        const agreed = submission.agreed ? '✓ Zustimmung' : '✗ Ablehnung';
        const pct = `${submission.estimatedPercent}%`;
        snapshotUrl = `data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#f5f5f5"/><text x="100" y="35" text-anchor="middle" font-size="14" font-family="sans-serif" fill="black">${agreed}</text><text x="100" y="55" text-anchor="middle" font-size="12" font-family="sans-serif" fill="#666">Schätzung: ${pct}</text></svg>`
        )}`;
    }

    const placeholderCollage: StickerCollage = {
        id: collageId,
        playerId,
        roundIndex: currentRoundIndex,
        placements: [],
        submittedAt: now,
        snapshotUrl,
    };
    gameState.submissions[currentRoundIndex].push(placeholderCollage);

    return {stateChanged: true, events: [{type: "collage-submitted", playerId, collageId}]};
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
        transitionToVoting(state, config.stickerCollage, now);
        transitionToResults(state, config.stickerCollage, now);
        return buildResultsEvents(state);
    }

    transitionToVoting(state, config.stickerCollage, now);

    const {phaseState} = state.gameState;
    if (phaseState.phase !== "VOTING") {
        return noChange;
    }

    return {stateChanged: true, events: [{type: "voting-started", votingEndsAt: phaseState.votingEndsAt}]};
}

// ─── VOTING ─────────────────────────────────────────────────────

/**
 * "cast-vote": vote for a collage (max votesPerPlayer per player, no self-votes).
 */
export function castVote(
    state: SessionState,
    playerId: string,
    collageId: string,
    config: GameConfig,
): HandlerResult {
    const {gameState} = state;
    const votingPhase = asVotingPhase(gameState);
    if (!votingPhase) {
        return noChange;
    }

    const roundSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
    const targetCollage = roundSubmissions.find((sub: StickerCollage) => sub.id === collageId);
    if (!targetCollage || targetCollage.playerId === playerId) {
        return noChange;
    }

    const myVotes = votingPhase.currentVotes[playerId] ?? [];

    // Toggle: clicking an already-voted collage removes the vote
    if (myVotes.includes(collageId)) {
        votingPhase.currentVotes[playerId] = myVotes.filter(v => v !== collageId);
        return {stateChanged: true, events: [{type: "vote-unregistered", voterId: playerId, collageId}]};
    }

    // At capacity: remove the oldest vote before adding the new one
    if (myVotes.length >= config.stickerCollage.votesPerPlayer) {
        votingPhase.currentVotes[playerId] = [...myVotes.slice(1), collageId];
        return {stateChanged: true, events: [{type: "vote-registered", voterId: playerId, collageId}]};
    }

    // Add the new vote
    votingPhase.currentVotes[playerId] = [...myVotes, collageId];
    return {stateChanged: true, events: [{type: "vote-registered", voterId: playerId, collageId}]};
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

    transitionToResults(state, config.stickerCollage, now);
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
 * "pick-prompt": winner picks the next round's prompt from the offered choices.
 */
export function winnerPicksPrompt(
    state: SessionState,
    playerId: string,
    prompt: string,
): HandlerResult {
    const {gameState} = state;
    const resultsPhase = asResultsPhase(gameState);
    if (!resultsPhase || resultsPhase.winnerId !== playerId) {
        return noChange;
    }
    if (!resultsPhase.promptChoices.includes(prompt)) {
        return noChange;
    }

    gameState.promptHistory[gameState.currentRoundIndex + 1] = prompt;
    return {stateChanged: true, events: [{type: "prompt-chosen", prompt}]};
}

/**
 * "unlock-pack": winner unlocks a new sticker pack.
 * This is the final winner choice — marks choices as done.
 */
export function winnerUnlocksPack(
    state: SessionState,
    playerId: string,
    packId: string,
): HandlerResult {
    const {gameState} = state;
    const resultsPhase = asResultsPhase(gameState);
    if (!resultsPhase || resultsPhase.winnerId !== playerId) {
        return noChange;
    }
    if (!resultsPhase.packUnlockChoices.includes(packId)) {
        return noChange;
    }
    if (gameState.unlockedPackIds.includes(packId)) {
        return noChange;
    }

    gameState.unlockedPackIds.push(packId);
    resultsPhase.lastUnlockedPackId = packId;
    resultsPhase.winnerChoicesDone = true;

    const pack = gameState.stickerPacks.find(p => p.id === packId);
    return {stateChanged: true, events: [{type: "pack-unlocked", packId, packName: pack?.name ?? packId}]};
}

/**
 * "ready-to-advance": any player pressing this immediately starts the next round.
 * Only available once the winner has completed their choices (or there is no winner).
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
    transitionToNextRound(state, config.stickerCollage, minigameConfig, now);

    const {gameState} = state;
    const {phaseState} = gameState;
    if (phaseState.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [{type: "round-started", roundIndex: gameState.currentRoundIndex, prompt: gameState.currentPrompt, endsAt: phaseState.roundEndsAt}],
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

    transitionToNextRound(state, config.stickerCollage, minigameConfig, now);

    const {gameState} = state;
    const {phaseState} = gameState;
    if (phaseState.phase !== "BUILDING") {
        return noChange;
    }

    return {
        stateChanged: true,
        events: [{type: "round-started", roundIndex: gameState.currentRoundIndex, prompt: gameState.currentPrompt, endsAt: phaseState.roundEndsAt}],
    };
}
