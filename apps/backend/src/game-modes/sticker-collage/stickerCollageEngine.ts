import type {
    GameConfig,
    SessionState,
    StickerCollageClientAction,
    StickerCollageModeState,
    StickerCollageServerEvent,
} from "@birthday/shared";
import type {GameActionResult, GameModeEngine} from "../gameModeEngine.js";
import {DEFAULT_STICKER_CATALOG} from "./stickerCatalog.js";
import {startNewRound, endRound} from "./roundManager.js";
import {handleRequestHand, handleSwapSticker, handleSubmitCollage, handleCastVote} from "./actionHandlers.js";

export class StickerCollageEngine implements GameModeEngine<"sticker-collage", StickerCollageModeState> {
    public readonly mode = "sticker-collage" as const;

    public constructor(private readonly config: GameConfig) {}

    public createInitialState(): StickerCollageModeState {
        return {
            mode: "sticker-collage",
            currentRoundIndex: 0,
            phase: "BUILDING",
            currentPrompt: "",
            roundStartedAt: null,
            roundEndsAt: null,
            stickerCatalog: DEFAULT_STICKER_CATALOG,
            playerHands: {},
            submissions: {},
            currentVotes: {},
            lastVoteResults: [],
            promptHistory: {},
            handSize: this.config.stickerCollage.handSize,
            maxStickersOnCanvas: this.config.stickerCollage.maxStickersOnCanvas,
            swapCount: this.config.stickerCollage.swapCount,
            votesPerPlayer: this.config.stickerCollage.votesPerPlayer,
        };
    }

    public onPlayerJoined(args: {
        sessionState: SessionState<StickerCollageModeState>;
        player: {id: string};
        now: number;
    }): GameActionResult<"sticker-collage"> {
        // No-op: hands are dealt on demand via "request-hand" action
        return {stateChanged: false, emittedEvents: []};
    }

    public startMode(args: {
        sessionState: SessionState<StickerCollageModeState>;
        now: number;
    }): GameActionResult<"sticker-collage"> {
        startNewRound(args.sessionState, this.config.stickerCollage, args.now);

        const ms = args.sessionState.modeState;
        return {
            stateChanged: true,
            emittedEvents: [{
                type: "round-started",
                roundIndex: ms.currentRoundIndex,
                prompt: ms.currentPrompt,
                endsAt: ms.roundEndsAt!,
            }],
        };
    }

    public resetMode(args: {
        sessionState: SessionState<StickerCollageModeState>;
    }): GameActionResult<"sticker-collage"> {
        args.sessionState.modeState = this.createInitialState();
        return {stateChanged: true, emittedEvents: []};
    }

    public applyAction(args: {
        sessionState: SessionState<StickerCollageModeState>;
        action: StickerCollageClientAction;
        context: {playerId: string; now: number};
    }): GameActionResult<"sticker-collage"> {
        const {sessionState, action, context} = args;

        switch (action.type) {
            case "request-hand": {
                const result = handleRequestHand(sessionState, context.playerId, this.config);
                return {stateChanged: result.stateChanged, emittedEvents: result.events};
            }

            case "swap-sticker": {
                const result = handleSwapSticker(sessionState, context.playerId, action.handIndex, action.newStickerId);
                return {stateChanged: result.stateChanged, emittedEvents: result.events};
            }

            case "submit-collage": {
                const result = handleSubmitCollage(sessionState, context.playerId, action.placements, this.config, context.now);
                return {stateChanged: result.stateChanged, emittedEvents: result.events};
            }

            case "cast-vote": {
                const result = handleCastVote(sessionState, context.playerId, action.collageId, this.config);
                return {stateChanged: result.stateChanged, emittedEvents: result.events};
            }

            case "start-round": {
                // Admin/host action: manually advance to next round
                return this.advanceRound(sessionState, context.now);
            }

            default:
                return {stateChanged: false, emittedEvents: []};
        }
    }

    public getNextTimerAt(args: {
        sessionState: SessionState<StickerCollageModeState>;
        now: number;
    }): number | null {
        const ms = args.sessionState.modeState;
        if (ms.roundEndsAt && args.now < ms.roundEndsAt) {
            return ms.roundEndsAt;
        }
        return null;
    }

    public onTimerElapsed(args: {
        sessionState: SessionState<StickerCollageModeState>;
        now: number;
    }): GameActionResult<"sticker-collage"> {
        return this.advanceRound(args.sessionState, args.now);
    }

    private advanceRound(
        state: SessionState<StickerCollageModeState>,
        now: number,
    ): GameActionResult<"sticker-collage"> {
        const ms = state.modeState;
        const previousRound = ms.currentRoundIndex;

        // End current round (tallies votes, awards points, starts next round)
        endRound(state, this.config.stickerCollage, now);

        const events: StickerCollageServerEvent[] = [];

        // Emit score updates for point winners
        for (const result of ms.lastVoteResults) {
            if (result.pointsAwarded > 0 && state.players[result.playerId]) {
                events.push({
                    type: "score-update",
                    playerId: result.playerId,
                    newScore: state.players[result.playerId].score,
                });
            }
        }

        // Emit round-ended for the previous round
        events.push({
            type: "round-ended",
            roundIndex: previousRound,
            results: ms.lastVoteResults,
        });

        // Emit round-started for the new round
        events.push({
            type: "round-started",
            roundIndex: ms.currentRoundIndex,
            prompt: ms.currentPrompt,
            endsAt: ms.roundEndsAt!,
        });

        return {stateChanged: true, emittedEvents: events};
    }
}

