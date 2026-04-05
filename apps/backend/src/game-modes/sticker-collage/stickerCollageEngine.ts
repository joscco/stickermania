import fs from "node:fs";
import path from "node:path";
import type {
    GameConfig,
    SessionState,
    StickerCollageClientAction,
    StickerCollageModeState,
    StickerCollageServerEvent,
    StickerDefinition,
} from "@birthday/shared";
import type {GameActionResult, GameModeEngine} from "../gameModeEngine.js";
import {DEFAULT_STICKER_CATALOG, DEFAULT_STICKER_PACKS} from "./stickerCatalog.js";
import {startVoting, startResults, advanceFromResults} from "./roundManager.js";
import {
    handleRequestHand,
    handleSwapSticker,
    handleSubmitCollage,
    handleCastVote,
    handleStartGame,
    handleEndRoundEarly,
    handleEndVotingEarly,
    handlePickPrompt,
    handleUnlockPack,
    handlePickGuaranteedPack,
    handleAdvanceFromResults,
} from "./actionHandlers.js";

/**
 * Merge hitbox polygon data from hitbox-data.json into the sticker catalog.
 */
function buildCatalogWithHitboxes(): StickerDefinition[] {
    let hitboxData: Record<string, Array<{x: number; y: number}>> = {};
    try {
        const hitboxPath = path.resolve(process.cwd(), "hitbox-data.json");
        hitboxData = JSON.parse(fs.readFileSync(hitboxPath, "utf-8"));
    } catch {
        // File doesn't exist or is invalid — use catalog as-is
    }

    return DEFAULT_STICKER_CATALOG.map(sticker => {
        const polygon = hitboxData[sticker.id];
        if (polygon && Array.isArray(polygon) && polygon.length >= 3) {
            return {...sticker, hitboxPolygon: polygon};
        }
        return sticker;
    });
}

export class StickerCollageEngine implements GameModeEngine<"sticker-collage", StickerCollageModeState> {
    public readonly mode = "sticker-collage" as const;

    public constructor(private readonly config: GameConfig) {}

    public createInitialState(): StickerCollageModeState {
        const packs = DEFAULT_STICKER_PACKS;
        const unlockedPackIds = packs.filter(p => p.unlockedAtStart).map(p => p.id);

        return {
            mode: "sticker-collage",
            currentRoundIndex: 0,
            phase: "LOBBY",
            currentPrompt: "",
            roundStartedAt: null,
            roundEndsAt: null,
            votingEndsAt: null,
            resultsEndsAt: null,
            stickerCatalog: buildCatalogWithHitboxes(),
            stickerPacks: packs,
            unlockedPackIds,
            guaranteedPackId: null,
            playerHands: {},
            submissions: {},
            currentVotes: {},
            lastVoteResults: [],
            winnerId: null,
            promptChoices: [],
            packUnlockChoices: [],
            guaranteedPackChoices: [],
            lastUnlockedPackId: null,
            winnerChoicesDone: false,
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
        return {stateChanged: false, emittedEvents: []};
    }

    public startMode(args: {
        sessionState: SessionState<StickerCollageModeState>;
        now: number;
    }): GameActionResult<"sticker-collage"> {
        // startMode puts us in LOBBY — the actual game starts via "start-game" action
        args.sessionState.modeState.phase = "LOBBY";
        return {stateChanged: true, emittedEvents: []};
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
                const r = handleRequestHand(sessionState, context.playerId, this.config);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "swap-sticker": {
                const r = handleSwapSticker(sessionState, context.playerId, action.handIndex, action.newStickerId);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "submit-collage": {
                const r = handleSubmitCollage(sessionState, context.playerId, action.placements, this.config, context.now);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "cast-vote": {
                const r = handleCastVote(sessionState, context.playerId, action.collageId, this.config);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "start-game": {
                const r = handleStartGame(sessionState, this.config, context.now);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "end-round-early": {
                const r = handleEndRoundEarly(sessionState, this.config, context.now);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "end-voting-early": {
                const r = handleEndVotingEarly(sessionState, this.config, context.now);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "pick-prompt": {
                const r = handlePickPrompt(sessionState, context.playerId, action.prompt);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "unlock-pack": {
                const r = handleUnlockPack(sessionState, context.playerId, action.packId);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "pick-guaranteed-pack": {
                const r = handlePickGuaranteedPack(sessionState, context.playerId, action.packId);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
            }
            case "advance-from-results": {
                const r = handleAdvanceFromResults(sessionState, this.config, context.now);
                return {stateChanged: r.stateChanged, emittedEvents: r.events};
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

        if (ms.phase === "BUILDING" && ms.roundEndsAt && args.now < ms.roundEndsAt) {
            return ms.roundEndsAt;
        }
        if (ms.phase === "VOTING" && ms.votingEndsAt && args.now < ms.votingEndsAt) {
            return ms.votingEndsAt;
        }
        if (ms.phase === "RESULTS" && ms.resultsEndsAt && args.now < ms.resultsEndsAt) {
            return ms.resultsEndsAt;
        }

        return null;
    }

    public onTimerElapsed(args: {
        sessionState: SessionState<StickerCollageModeState>;
        now: number;
    }): GameActionResult<"sticker-collage"> {
        const ms = args.sessionState.modeState;

        if (ms.phase === "BUILDING") {
            // Building timer expired → move to voting
            startVoting(args.sessionState, this.config.stickerCollage, args.now);
            return {
                stateChanged: true,
                emittedEvents: [{type: "voting-started", votingEndsAt: ms.votingEndsAt!}],
            };
        }

        if (ms.phase === "VOTING") {
            // Voting timer expired → tally and show results
            startResults(args.sessionState, this.config.stickerCollage, args.now);

            const events: StickerCollageServerEvent[] = [];
            for (const result of ms.lastVoteResults) {
                if (result.pointsAwarded > 0 && args.sessionState.players[result.playerId]) {
                    events.push({
                        type: "score-update",
                        playerId: result.playerId,
                        newScore: args.sessionState.players[result.playerId].score,
                    });
                }
            }
            events.push({
                type: "results-ready",
                winnerId: ms.winnerId,
                results: ms.lastVoteResults,
            });
            return {stateChanged: true, emittedEvents: events};
        }

        if (ms.phase === "RESULTS") {
            // Results timer expired → auto-advance to next round
            advanceFromResults(args.sessionState, this.config.stickerCollage, args.now);
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

        return {stateChanged: false, emittedEvents: []};
    }
}
