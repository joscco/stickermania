import fs from "node:fs";
import path from "node:path";
import type {GameConfig, SessionState, StickerCollageGameState, StickerCollageServerEvent, StickerDefinition,} from "@birthday/shared";
import type {GameActionResult, GameEngine} from "../gameModeEngine.js";
import {buildCatalog, buildPacks} from "./stickerCatalog.js";
import {transitionToNextRound, transitionToResults, transitionToVoting, shouldSkipVoting} from "./roundManager.js";
import {advanceToNextRound, boardAdvancesToNextRound, castVote, dealHandToPlayer, endBuildingPhaseEarly, endVotingPhaseEarly, markPlayerDoneVoting, skipRound, startGame, submitCollage, winnerPicksGuaranteedPack, winnerPicksPrompt, winnerUnlocksPack,} from "./actionHandlers.js";

/**
 * Merge hitbox polygon data from hitbox-data.json into the sticker catalog built from config.
 */
function buildCatalogWithHitboxes(config: GameConfig): StickerDefinition[] {
    let hitboxData: Record<string, Array<{x: number; y: number}>> = {};
    try {
        const hitboxPath = path.resolve(process.cwd(), "hitbox-data.json");
        hitboxData = JSON.parse(fs.readFileSync(hitboxPath, "utf-8"));
    } catch {
        // File doesn't exist or is invalid — use catalog as-is
    }

    return buildCatalog(config.stickerCollage.catalog).map(sticker => {
        const polygon = hitboxData[sticker.id];
        if (polygon && Array.isArray(polygon) && polygon.length >= 3) {
            return {...sticker, hitboxPolygon: polygon};
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
            roundStartedAt: null,
            stickerCatalog: buildCatalogWithHitboxes(this.config),
            stickerPacks: packs,
            unlockedPackIds,
            guaranteedPackId: null,
            submissions: {},
            promptHistory: {},
            roundParticipantIds: [],
            handSize: this.config.stickerCollage.handSize,
            maxStickersOnCanvas: this.config.stickerCollage.maxStickersOnCanvas,
            votesPerPlayer: this.config.stickerCollage.votesPerPlayer,
            phaseState: {phase: "LOBBY"},
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
        action: import("@birthday/shared").StickerCollageClientAction;
        context: {sessionId: string; playerId: string; clientId: string; clientKind: import("@birthday/shared").ClientKind; now: number};
    }): GameActionResult {
        const result = this.dispatchAction(args.sessionState, args.action, args.context);
        return {stateChanged: result.stateChanged, emittedEvents: result.events};
    }

    private dispatchAction(
        state: SessionState,
        action: import("@birthday/shared").StickerCollageClientAction,
        context: {playerId: string; now: number},
    ) {
        const {playerId, now} = context;

        switch (action.type) {
            case "request-hand":         return dealHandToPlayer(state, playerId, this.config);
            case "submit-collage":       return submitCollage(state, playerId, action.placements, this.config, now);
            case "skip-round":           return skipRound(state, playerId);
            case "cast-vote":            return castVote(state, playerId, action.collageId, this.config);
            case "done-voting":          return markPlayerDoneVoting(state, playerId);
            case "ready-to-advance":     return advanceToNextRound(state, playerId, this.config, now);
            case "start-game":           return startGame(state, this.config, now);
            case "end-round-early":      return endBuildingPhaseEarly(state, this.config, now);
            case "end-voting-early":     return endVotingPhaseEarly(state, this.config, now);
            case "pick-prompt":          return winnerPicksPrompt(state, playerId, action.prompt);
            case "unlock-pack":          return winnerUnlocksPack(state, playerId, action.packId);
            case "pick-guaranteed-pack": return winnerPicksGuaranteedPack(state, playerId, action.packId);
            case "advance-from-results": return boardAdvancesToNextRound(state, this.config, now);
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
            transitionToNextRound(sessionState, this.config.stickerCollage, now);
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
