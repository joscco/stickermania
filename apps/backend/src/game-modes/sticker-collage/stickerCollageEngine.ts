import fs from "node:fs";
import path from "node:path";
import type {GameConfig, SessionState, StickerCollageGameState, StickerCollageServerEvent, StickerDefinition, MinigameClientAction,} from "@birthday/shared";
import type {GameActionResult, GameEngine} from "../gameModeEngine.js";
import {buildCatalog, buildPacks} from "./stickerCatalog.js";
import {transitionToNextRound, transitionToResults, transitionToVoting, shouldSkipVoting} from "./roundManager.js";
import {advanceToNextRound, boardAdvancesToNextRound, castVote, endBuildingPhaseEarly, endVotingPhaseEarly, markPlayerDoneVoting, skipRound, startGame, submitCollage, winnerPicksPrompt, winnerUnlocksPack, submitMinigame,} from "./actionHandlers.js";

/**
 * Merge hitbox polygon data from hitbox-data.json into the sticker catalog built from config.
 */
function buildCatalogWithHitboxes(config: GameConfig): StickerDefinition[] {
    let hitboxData: Record<string, any> = {};
    try {
        const hitboxPath = path.resolve(process.cwd(), "hitbox-data.json");
        hitboxData = JSON.parse(fs.readFileSync(hitboxPath, "utf-8"));
    } catch {
        // File doesn't exist or is invalid — use catalog as-is
    }

    return buildCatalog(config.stickerCollage.catalog).map(sticker => {
        const raw = hitboxData[sticker.id];
        if (!raw) return sticker;

        let polygon: Array<{x: number; y: number}> | undefined;
        let overlayBounds: {x: number; y: number; w: number; h: number} | undefined;

        if (Array.isArray(raw)) {
            polygon = raw;
        } else if (typeof raw === 'object') {
            polygon = raw.polygon;
            overlayBounds = raw.overlayBounds;
        }

        if (polygon && polygon.length >= 3) {
            return {...sticker, hitboxPolygon: polygon, overlayBounds};
        }
        return sticker;
    });
}

export class StickerCollageEngine implements GameEngine {
    public constructor(private readonly config: GameConfig) {}

    public createInitialState(): StickerCollageGameState {
        const packs = buildPacks(this.config.stickerCollage.catalog);
        const unlockedPackIds = packs.filter(pack => pack.unlockedAtStart).map(pack => pack.id);

        return {
            currentRoundIndex: 0,
            currentPrompt: "",
            currentTask: null,
            currentRecommendedPackIds: [],
            roundStartedAt: null,
            stickerCatalog: buildCatalogWithHitboxes(this.config),
            stickerPacks: packs,
            unlockedPackIds,
            submissions: {},
            minigameSubmissions: {},
            promptHistory: {},
            roundParticipantIds: [],
            maxStickersOnCanvas: this.config.stickerCollage.maxStickersOnCanvas,
            votesPerPlayer: this.config.stickerCollage.votesPerPlayer,
            phaseState: {phase: "LOBBY"},
            roundDurationSec: this.config.stickerCollage.roundDurationSec,
            votingDurationSec: this.config.stickerCollage.votingDurationSec,
            resultsDurationSec: this.config.stickerCollage.resultsDurationSec,
        };
    }

    public onPlayerJoined(args: {
        sessionState: SessionState;
        player: {id: string};
        now: number;
    }): GameActionResult {
        const {gameState} = args.sessionState;
        const isNotLobby = gameState.phaseState.phase !== "LOBBY";
        const isNewParticipant = !gameState.roundParticipantIds.includes(args.player.id);

        if (isNotLobby && isNewParticipant) {
            gameState.roundParticipantIds.push(args.player.id);
            return {stateChanged: true, emittedEvents: []};
        }
        return {stateChanged: false, emittedEvents: []};
    }

    public startGame(args: {
        sessionState: SessionState;
        now: number;
    }): GameActionResult {
        args.sessionState.gameState.phaseState = {phase: "LOBBY"};
        return {stateChanged: true, emittedEvents: []};
    }

    public resetGame(args: {
        sessionState: SessionState;
        now: number;
    }): GameActionResult {
        args.sessionState.gameState = this.createInitialState();
        return {stateChanged: true, emittedEvents: []};
    }

    public applyAction(args: {
        sessionState: SessionState;
        action: import("@birthday/shared").GameClientAction;
        context: {sessionId: string; playerId: string; clientId: string; clientKind: import("@birthday/shared").ClientKind; now: number};
    }): GameActionResult {
        const result = this.dispatchAction(args.sessionState, args.action, args.context);
        return {stateChanged: result.stateChanged, emittedEvents: result.events};
    }

    private dispatchAction(
        state: SessionState,
        action: import("@birthday/shared").GameClientAction,
        context: {playerId: string; now: number},
    ) {
        const {playerId, now} = context;

        switch (action.type) {
            case "submit-collage":       return submitCollage(state, playerId, action.placements, this.config, now);
            case "skip-round":           return skipRound(state, playerId);
            case "cast-vote":            return castVote(state, playerId, "collageId" in action ? action.collageId : (action as any).submissionId ?? "", this.config);
            case "done-voting":          return markPlayerDoneVoting(state, playerId);
            case "ready-to-advance":     return advanceToNextRound(state, playerId, this.config, this.config.minigame, now);
            case "start-game":           return startGame(state, this.config, this.config.minigame, now);
            case "end-round-early":      return endBuildingPhaseEarly(state, this.config, now);
            case "end-voting-early":     return endVotingPhaseEarly(state, this.config, now);
            case "pick-prompt":          return winnerPicksPrompt(state, playerId, action.prompt);
            case "unlock-pack":          return winnerUnlocksPack(state, playerId, action.packId);
            case "advance-from-results": return boardAdvancesToNextRound(state, this.config, this.config.minigame, now);
            case "submit-sticker-place":
            case "submit-drawing":
            case "submit-choice":
            case "submit-number":
            case "submit-timer":
            case "submit-shape-split":   return submitMinigame(state, playerId, action as MinigameClientAction, now);
            default:                     return {stateChanged: false, events: []};
        }
    }

    public getNextTimerAt(args: {
        sessionState: SessionState;
        now: number;
    }): number | null {
        const {phaseState} = args.sessionState.gameState;
        const {now} = args;

        if (phaseState.phase === "BUILDING" && now < phaseState.roundEndsAt)   { return phaseState.roundEndsAt; }
        if (phaseState.phase === "VOTING"   && now < phaseState.votingEndsAt)  { return phaseState.votingEndsAt; }
        if (phaseState.phase === "RESULTS"  && now < phaseState.resultsEndsAt) { return phaseState.resultsEndsAt; }
        return null;
    }

    public onTimerElapsed(args: {
        sessionState: SessionState;
        now: number;
    }): GameActionResult {
        const {sessionState, now} = args;
        const {gameState} = sessionState;
        const {phaseState} = gameState;

        if (phaseState.phase === "BUILDING") {
            if (shouldSkipVoting(gameState)) {
                const roundSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
                if (roundSubmissions.length === 0) {
                    gameState.phaseState = {phase: "LOBBY"};
                    return {stateChanged: true, emittedEvents: []};
                }
                transitionToVoting(sessionState, this.config.stickerCollage, now);
                transitionToResults(sessionState, this.config.stickerCollage, now);
                const newPhase = gameState.phaseState;
                if (newPhase.phase !== "RESULTS") {
                    return {stateChanged: false, emittedEvents: []};
                }
                return {
                    stateChanged: true,
                    emittedEvents: [
                        {type: "results-ready", winnerId: newPhase.winnerId, results: newPhase.lastVoteResults},
                    ],
                };
            }
            transitionToVoting(sessionState, this.config.stickerCollage, now);
            const newPhase = gameState.phaseState;
            if (newPhase.phase !== "VOTING") {
                return {stateChanged: false, emittedEvents: []};
            }
            return {stateChanged: true, emittedEvents: [{type: "voting-started", votingEndsAt: newPhase.votingEndsAt}]};
        }

        if (phaseState.phase === "VOTING") {
            transitionToResults(sessionState, this.config.stickerCollage, now);
            const newPhase = gameState.phaseState;
            if (newPhase.phase !== "RESULTS") {
                return {stateChanged: false, emittedEvents: []};
            }
            return {
                stateChanged: true,
                emittedEvents: [
                    {type: "results-ready", winnerId: newPhase.winnerId, results: newPhase.lastVoteResults},
                ],
            };
        }

        if (phaseState.phase === "RESULTS") {
            const roundSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
            if (roundSubmissions.length === 0) {
                gameState.phaseState = {phase: "LOBBY"};
                return {stateChanged: true, emittedEvents: []};
            }
            transitionToNextRound(sessionState, this.config.stickerCollage, this.config.minigame, now);
            const newPhase = gameState.phaseState;
            if (newPhase.phase !== "BUILDING") {
                return {stateChanged: false, emittedEvents: []};
            }
            return {
                stateChanged: true,
                emittedEvents: [{type: "round-started", roundIndex: gameState.currentRoundIndex, prompt: gameState.currentPrompt, endsAt: newPhase.roundEndsAt}],
            };
        }

        return {stateChanged: false, emittedEvents: []};
    }
}
