import type {GameConfig, MinigameClientAction, SessionState, StickerCollageGameState,} from "@birthday/shared";
import type {GameActionResult, GameEngine} from "../gameModeEngine.js";
import {shouldSkipVoting, transitionToNextRound, transitionToResults, transitionToVoting} from "./roundManager.js";
import {advanceToNextRound, boardAdvancesToNextRound, castVote, endBuildingPhaseEarly, endVotingPhaseEarly, markPlayerDoneVoting, skipRound, startGame, submitMinigame,} from "./actionHandlers.js";

export class StickerCollageEngine implements GameEngine {
    public constructor(private readonly config: GameConfig) {
    }

    public createInitialState(): StickerCollageGameState {
        return {
            currentRoundIndex: 0,
            currentPrompt: "",
            currentTask: null,
            roundStartedAt: null,
            submissions: {},
            minigameSubmissions: {},
            promptHistory: {},
            roundParticipantIds: [],
            phaseState: {phase: "LOBBY"},
            roundDurationSec: 60,
            votingDurationSec: 60,
            resultsDurationSec: 60
        };
    }

    public onPlayerJoined(args: {
        sessionState: SessionState;
        player: { id: string };
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
        context: {
            sessionId: string;
            playerId: string;
            clientId: string;
            clientKind: import("@birthday/shared").ClientKind;
            now: number
        };
    }): GameActionResult {
        const result = this.dispatchAction(args.sessionState, args.action, args.context);
        return {stateChanged: result.stateChanged, emittedEvents: result.events};
    }

    private dispatchAction(
        state: SessionState,
        action: import("@birthday/shared").GameClientAction,
        context: { playerId: string; now: number },
    ) {
        const {playerId, now} = context;

        switch (action.type) {
            case "skip-round":
                return skipRound(state, playerId);
            case "cast-vote":
                return castVote(state, playerId, "collageId" in action ? action.collageId : (action as any).submissionId ?? "", this.config);
            case "done-voting":
                return markPlayerDoneVoting(state, playerId);
            case "ready-to-advance":
                return advanceToNextRound(state, playerId, this.config, this.config.minigame, now);
            case "start-game":
                return startGame(state, this.config, this.config.minigame, now);
            case "end-round-early":
                return endBuildingPhaseEarly(state, this.config, now);
            case "end-voting-early":
                return endVotingPhaseEarly(state, this.config, now);
            case "advance-from-results":
                return boardAdvancesToNextRound(state, this.config, this.config.minigame, now);
            case "submit-sticker-place":
            case "submit-drawing":
            case "submit-choice":
            case "submit-number":
            case "submit-timer":
            case "submit-shape-split":
            case "submit-text-answer":
            case "submit-thesis":
                return submitMinigame(state, playerId, action as MinigameClientAction, now);
            default:
                return {stateChanged: false, events: []};
        }
    }

    public getNextTimerAt(args: {
        sessionState: SessionState;
        now: number;
    }): number | null {
        const {phaseState} = args.sessionState.gameState;
        const {now} = args;

        if (phaseState.phase === "BUILDING" && now < phaseState.roundEndsAt) {
            return phaseState.roundEndsAt;
        }
        if (phaseState.phase === "VOTING" && now < phaseState.votingEndsAt) {
            return phaseState.votingEndsAt;
        }
        if (phaseState.phase === "RESULTS" && now < phaseState.resultsEndsAt) {
            return phaseState.resultsEndsAt;
        }
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
                transitionToVoting(sessionState, now);
                transitionToResults(sessionState, now);
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
            transitionToVoting(sessionState, now);
            const newPhase = gameState.phaseState;
            if (newPhase.phase !== "VOTING") {
                return {stateChanged: false, emittedEvents: []};
            }
            return {stateChanged: true, emittedEvents: [{type: "voting-started", votingEndsAt: newPhase.votingEndsAt}]};
        }

        if (phaseState.phase === "VOTING") {
            transitionToResults(sessionState, now);
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
            transitionToNextRound(sessionState, this.config.minigame, now);
            const newPhase = gameState.phaseState;
            if (newPhase.phase !== "BUILDING") {
                return {stateChanged: false, emittedEvents: []};
            }
            return {
                stateChanged: true,
                emittedEvents: [{
                    type: "round-started",
                    roundIndex: gameState.currentRoundIndex,
                    prompt: gameState.currentPrompt,
                    endsAt: newPhase.roundEndsAt
                }],
            };
        }

        return {stateChanged: false, emittedEvents: []};
    }
}
