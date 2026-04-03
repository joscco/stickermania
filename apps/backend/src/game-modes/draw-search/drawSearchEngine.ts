import type {
    DrawSearchClientAction,
    DrawSearchGameConfig,
    DrawSearchModeState,
    DrawSearchPlayerTask,
    DrawSearchServerEvent,
    GameConfig,
    SessionState,
} from "@birthday/shared";
import type {AssetRepository} from "../../infra/assetRepository.js";
import type {GameActionContext, GameActionResult, GameModeEngine} from "../gameModeEngine.js";
import {pickNextTask} from "./taskPicker.js";
import {handleSubmitCaption, handleSubmitDrawing, handleSubmitGuess} from "./actionHandlers.js";
import {injectTestDrawings} from "./testData.js";

/**
 * Async, timer-free draw-search engine.
 *
 * Each player individually cycles through DRAW → CAPTION → GUESS → DRAW...
 * The engine picks the best available task for each player after they complete one.
 * Seed drawings from assets are injected on start so there's immediately
 * something to caption and guess.
 */
export class DrawSearchEngine implements GameModeEngine<"draw-search", DrawSearchModeState> {
    public readonly mode = "draw-search" as const;
    private readonly ds: DrawSearchGameConfig;

    /** Per-player tracking (not persisted in state — rebuilt from state on reconnect). */
    private readonly playerCurrentTask = new Map<string, DrawSearchPlayerTask>();

    public constructor(
        private readonly config: GameConfig,
        private readonly assetRepository: AssetRepository,
    ) {
        this.ds = config.drawSearch;
    }

    // ─── Initial state ───────────────────────────────────────────────

    public createInitialState(): DrawSearchModeState {
        return {
            mode: "draw-search",
            phase: "LOBBY",
            drawings: {},
            captions: {},
            playerGuesses: {},
        };
    }

    // ─── Player joined ───────────────────────────────────────────────

    public onPlayerJoined(args: {
        sessionState: SessionState<DrawSearchModeState>;
        player: { id: string };
        now: number;
    }): GameActionResult<"draw-search"> {
        const ms = args.sessionState.modeState;
        const playerId = args.player.id;
        const events: DrawSearchServerEvent[] = [];

        events.push({type: "round-phase", phase: ms.phase});

        if (ms.phase === "ACTIVE") {
            const player = args.sessionState.players[playerId];
            if (player?.name.trim()) {
                const existingTask = this.playerCurrentTask.get(playerId);
                if (existingTask) {
                    events.push({type: "assign-task", targetPlayerId: playerId, task: existingTask});
                } else {
                    const task = pickNextTask(playerId, args.sessionState, undefined, this.ds);
                    if (task) {
                        this.playerCurrentTask.set(playerId, task);
                        events.push({type: "assign-task", targetPlayerId: playerId, task});
                    }
                }
            }
        }

        return {stateChanged: true, emittedEvents: events};
    }

    // ─── Start / Reset ───────────────────────────────────────────────

    public startMode(args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        const ms = args.sessionState.modeState;
        ms.phase = "ACTIVE";
        ms.drawings = {};
        ms.captions = {};
        ms.playerGuesses = {};
        this.playerCurrentTask.clear();

        if (this.ds.seedTestDrawings > 0) {
            injectTestDrawings(ms, this.ds.seedTestDrawings, args.now);
        }

        const events: DrawSearchServerEvent[] = [
            {type: "round-phase", phase: "ACTIVE"},
        ];

        for (const playerId of Object.keys(args.sessionState.players)) {
            const player = args.sessionState.players[playerId];
            if (!player?.name.trim()) continue;

            const task = pickNextTask(playerId, args.sessionState, undefined, this.ds);
            if (task) {
                this.playerCurrentTask.set(playerId, task);
                events.push({type: "assign-task", targetPlayerId: playerId, task});
            }
        }

        return {stateChanged: true, emittedEvents: events};
    }

    public resetMode(args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        args.sessionState.modeState = this.createInitialState();
        this.playerCurrentTask.clear();
        return {
            stateChanged: true,
            emittedEvents: [{type: "round-phase", phase: "LOBBY"}],
        };
    }

    // ─── Apply action ────────────────────────────────────────────────

    public async applyAction(args: {
        sessionState: SessionState<DrawSearchModeState>;
        action: DrawSearchClientAction;
        context: GameActionContext;
    }): Promise<GameActionResult<"draw-search">> {
        switch (args.action.type) {
            case "start-round":
                return this.startMode({sessionState: args.sessionState, now: args.context.now});

            case "submit-drawing":
                return handleSubmitDrawing(
                    args.sessionState, args.context, args.action.imageDataUrl,
                    this.playerCurrentTask, this.ds, this.assetRepository,
                );

            case "submit-caption":
                return handleSubmitCaption(
                    args.sessionState, args.context, args.action.drawingId, args.action.text,
                    this.playerCurrentTask, this.ds,
                );

            case "submit-guess":
                return handleSubmitGuess(
                    args.sessionState, args.context, args.action.drawingId, args.action.captionId,
                    this.playerCurrentTask, this.ds,
                );

            default:
                return {stateChanged: false, emittedEvents: []};
        }
    }

    // No timers in async mode
    public getNextTimerAt(): number | null {
        return null;
    }

    public onTimerElapsed(): GameActionResult<"draw-search"> {
        return {stateChanged: false, emittedEvents: []};
    }
}
