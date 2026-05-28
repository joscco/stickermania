import type {GameConfig, MinigameClientAction, SessionState, PartyGameState,} from "@birthday/shared";
import type {GameActionResult, GameEngine} from "../gameModeEngine.js";
import {
    transitionToFollowUpRoundIfAvailable,
    transitionToNextRound,
    transitionToRoundResults,
} from "./roundManager.js";
import {
    advanceToNextRound,
    boardAdvancesToNextRound,
    endRoundEarly,
    skipRound,
    startGame,
    submitMinigame,
} from "./actionHandlers.js";

const AUTO_SUBMIT_GRACE_MS = 2000;

export class PartyGameEngine implements GameEngine {
    public constructor(private readonly config: GameConfig) {
    }

    public createInitialState(): PartyGameState {
        return {
            currentRoundIndex: 0,
            currentPrompt: "",
            currentTask: null,
            roundStartedAt: null,
            submissions: {},
            minigameSubmissions: {},
            promptHistory: {},
            playedTaskIds: [],
            roundParticipantIds: [],
            phaseState: {phase: "LOBBY"},
            roundDurationSec: 60,
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
            case "ready-to-advance":
                return advanceToNextRound(state, playerId, this.config, this.config.minigame, now);
            case "start-game":
                return startGame(state, this.config, this.config.minigame, now);
            case "end-round-early":
                return endRoundEarly(state, this.config, now);
            case "advance-from-results":
                return boardAdvancesToNextRound(state, this.config, this.config.minigame, now);
            case "submit-minigame":
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

        if (phaseState.phase === "ROUND_ACTIVE") {
            if (phaseState.autoSubmitGraceEndsAt && now < phaseState.autoSubmitGraceEndsAt) {
                return phaseState.autoSubmitGraceEndsAt;
            }
            if (now < phaseState.roundEndsAt) {
                return phaseState.roundEndsAt;
            }
            if (!phaseState.autoSubmitGraceEndsAt) {
                return now;
            }
        }
        if (phaseState.phase === "ROUND_RESULTS" && now < phaseState.resultsEndsAt) {
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

        if (phaseState.phase === "ROUND_ACTIVE") {
            if (!phaseState.autoSubmitGraceEndsAt) {
                phaseState.autoSubmitGraceEndsAt = now + AUTO_SUBMIT_GRACE_MS;
                return {stateChanged: true, emittedEvents: []};
            }

            const roundSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
            if (roundSubmissions.length === 0) {
                gameState.phaseState = {phase: "LOBBY"};
                return {stateChanged: true, emittedEvents: []};
            }

            if (transitionToFollowUpRoundIfAvailable(sessionState, this.config.minigame, now)) {
                const newPhase = gameState.phaseState;
                if (newPhase.phase !== "ROUND_ACTIVE") {
                    return {stateChanged: false, emittedEvents: []};
                }
                return {
                    stateChanged: true,
                    emittedEvents: [{
                        type: "round-started",
                        roundIndex: gameState.currentRoundIndex,
                        prompt: gameState.currentPrompt,
                        endsAt: newPhase.roundEndsAt,
                    }],
                };
            }

            transitionToRoundResults(sessionState, now);
            const newPhase = gameState.phaseState;
            if (newPhase.phase !== "ROUND_RESULTS") {
                return {stateChanged: false, emittedEvents: []};
            }
            return {
                stateChanged: true,
                emittedEvents: [
                    {type: "results-ready", winnerId: newPhase.winnerId, results: newPhase.lastResults},
                ],
            };
        }

        if (phaseState.phase === "ROUND_RESULTS") {
            const roundSubmissions = gameState.submissions[gameState.currentRoundIndex] ?? [];
            if (roundSubmissions.length === 0) {
                gameState.phaseState = {phase: "LOBBY"};
                return {stateChanged: true, emittedEvents: []};
            }
            transitionToNextRound(sessionState, this.config.minigame, now);
            const newPhase = gameState.phaseState;
            if (newPhase.phase !== "ROUND_ACTIVE") {
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
