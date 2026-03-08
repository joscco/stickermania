import crypto from "node:crypto";
import type {
    DrawSearchClientAction,
    DrawSearchDrawing,
    DrawSearchModeState,
    DrawSearchPlayerPromptAssignment,
    DrawSearchRoundState,
    DrawSearchServerEvent,
    GameConfig,
    SessionState,
} from "@birthday/shared";
import { clampInt } from "@birthday/shared";
import type { AssetRepository } from "../../infra/assetRepository.js";
import type { GameActionContext, GameActionResult, GameModeEngine } from "../../session/gameModeEngine.js";

export class DrawSearchEngine implements GameModeEngine<"draw-search", DrawSearchModeState> {
    public readonly mode = "draw-search" as const;

    public constructor(
        private readonly config: GameConfig,
        private readonly assetRepository: AssetRepository,
    ) {}

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    public createInitialState(): DrawSearchModeState {
        return {
            mode: "draw-search",
            drawings: {},
            round: this.createDefaultRoundState(),
            promptAssignments: {},
            effectiveFieldWidth: this.config.fieldBaseSize,
            effectiveFieldHeight: this.config.fieldBaseSize,
        };
    }

    public onPlayerJoined(args: {
        sessionState: SessionState<DrawSearchModeState>;
    }): GameActionResult<"draw-search"> {
        const playerId = Object.keys(args.sessionState.players).at(-1);

        if (playerId && !args.sessionState.modeState.promptAssignments[playerId]) {
            args.sessionState.modeState.promptAssignments[playerId] = this.createEmptyPromptAssignment();
        }

        return { stateChanged: true, emittedEvents: [] };
    }

    public startMode(args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        const modeState = args.sessionState.modeState;
        modeState.round.phase = "DRAW";
        modeState.round.endsAt = args.now + modeState.round.drawDurationSec * 1000;
        modeState.round.roundNumber += 1;

        const events = this.assignDrawPrompts(args.sessionState);

        events.push({
            type: "round-phase",
            phase: "DRAW",
            endsAt: modeState.round.endsAt,
        });

        return { stateChanged: true, emittedEvents: events };
    }

    public resetMode(args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        args.sessionState.modeState = this.createInitialState();

        for (const playerId of Object.keys(args.sessionState.players)) {
            args.sessionState.modeState.promptAssignments[playerId] = this.createEmptyPromptAssignment();
        }

        return { stateChanged: true, emittedEvents: [] };
    }

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    public async applyAction(args: {
        sessionState: SessionState<DrawSearchModeState>;
        action: DrawSearchClientAction;
        context: GameActionContext;
    }): Promise<GameActionResult<"draw-search">> {
        switch (args.action.type) {
            case "start-round":
                return this.startMode({ sessionState: args.sessionState, now: args.context.now });

            case "set-timer": {
                args.sessionState.modeState.round.drawDurationSec = clampInt(args.action.drawDurationSec, 5, 600);
                args.sessionState.modeState.round.searchDurationSec = clampInt(args.action.searchDurationSec, 5, 600);
                return { stateChanged: true, emittedEvents: [] };
            }

            case "submit-drawing":
                return await this.handleSubmitDrawing(args.sessionState, args.context, args.action.imageDataUrl);

            case "search-snapshot":
                return this.handleSearchSnapshot(
                    args.sessionState, args.context.playerId,
                    args.action.centerX, args.action.centerY, args.action.radius,
                    args.context.now,
                );

            default:
                return { stateChanged: false, emittedEvents: [] };
        }
    }

    // -----------------------------------------------------------------------
    // Timer support
    // -----------------------------------------------------------------------

    public getNextTimerAt(args: {
        sessionState: SessionState<DrawSearchModeState>;
    }): number | null {
        const { phase, endsAt } = args.sessionState.modeState.round;
        return (phase === "DRAW" || phase === "SEARCH") && endsAt > 0 ? endsAt : null;
    }

    public onTimerElapsed(args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        const modeState = args.sessionState.modeState;

        if (modeState.round.phase === "DRAW") {
            modeState.round.phase = "SEARCH";
            modeState.round.endsAt = args.now + modeState.round.searchDurationSec * 1000;

            const events: DrawSearchServerEvent[] = this.assignSearchTasks(args.sessionState);
            events.push({ type: "round-phase", phase: "SEARCH", endsAt: modeState.round.endsAt });
            return { stateChanged: true, emittedEvents: events };
        }

        if (modeState.round.phase === "SEARCH") {
            modeState.round.phase = "PAUSED";
            modeState.round.endsAt = 0;
            return { stateChanged: true, emittedEvents: [{ type: "round-phase", phase: "PAUSED", endsAt: 0 }] };
        }

        return { stateChanged: false, emittedEvents: [] };
    }

    // -----------------------------------------------------------------------
    // Submit drawing
    // -----------------------------------------------------------------------

    private async handleSubmitDrawing(
        sessionState: SessionState<DrawSearchModeState>,
        context: GameActionContext,
        imageDataUrl: string,
    ): Promise<GameActionResult<"draw-search">> {
        const assignment = sessionState.modeState.promptAssignments[context.playerId];

        if (!assignment?.activeDrawPrompt) {
            return { stateChanged: false, emittedEvents: [] };
        }

        const drawingId = crypto.randomUUID();
        const prompt = assignment.activeDrawPrompt;
        const playerName = sessionState.players[context.playerId]?.name || "player";

        // Persist drawing as asset file
        const savedAsset = await this.assetRepository.saveDrawing({
            sessionId: context.sessionId,
            playerId: context.playerId,
            playerName,
            drawingId,
            prompt,
            imageDataUrl,
        });

        // Random placement within effective field
        const fieldW = sessionState.modeState.effectiveFieldWidth;
        const fieldH = sessionState.modeState.effectiveFieldHeight;
        const margin = this.config.imageSizePx / 2;

        const drawing: DrawSearchDrawing = {
            id: drawingId,
            artistId: context.playerId,
            prompt,
            imageUrl: savedAsset.publicUrl,
            imageAssetPath: savedAsset.assetPath,
            x: margin + Math.random() * Math.max(0, fieldW - 2 * margin),
            y: margin + Math.random() * Math.max(0, fieldH - 2 * margin),
            placedAt: context.now,
            foundBy: null,
            foundAt: null,
        };

        sessionState.modeState.drawings[drawingId] = drawing;

        // Advance to next prompt
        assignment.activeDrawPrompt = null;
        assignment.drawPromptIndex += 1;
        this.activateNextDrawPrompt(assignment);
        this.recalculateEffectiveFieldSize(sessionState.modeState);

        const events: DrawSearchServerEvent[] = [];

        if (assignment.activeDrawPrompt) {
            events.push({
                type: "assign-task",
                task: {
                    mode: "DRAW",
                    prompt: assignment.activeDrawPrompt,
                    drawIndex: assignment.drawPromptIndex,
                    drawTotal: assignment.drawPrompts.length,
                },
            });
        }

        return { stateChanged: true, emittedEvents: events };
    }

    // -----------------------------------------------------------------------
    // Search snapshot
    // -----------------------------------------------------------------------

    private handleSearchSnapshot(
        sessionState: SessionState<DrawSearchModeState>,
        playerId: string,
        centerX: number,
        centerY: number,
        radius: number,
        now: number,
    ): GameActionResult<"draw-search"> {
        const assignment = sessionState.modeState.promptAssignments[playerId];
        const expectedDrawingId = assignment?.activeSearchDrawingId;

        if (!expectedDrawingId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        const drawing = sessionState.modeState.drawings[expectedDrawingId];
        if (!drawing) {
            return { stateChanged: false, emittedEvents: [] };
        }

        const dx = drawing.x - centerX;
        const dy = drawing.y - centerY;
        const isCorrect = Math.sqrt(dx * dx + dy * dy) <= radius;

        if (!isCorrect) {
            return {
                stateChanged: false,
                emittedEvents: [{ type: "search-result", correct: false, drawingId: drawing.id, message: "Leider daneben." }],
            };
        }

        drawing.foundBy = playerId;
        drawing.foundAt = now;

        const searcher = sessionState.players[playerId];
        const artist = sessionState.players[drawing.artistId];
        if (searcher) { searcher.score += 1; }
        if (artist) { artist.score += 1; }

        // Advance to next search task
        assignment.activeSearchDrawingId = null;
        assignment.searchTaskIndex += 1;
        this.activateNextSearchTask(assignment);

        const events: DrawSearchServerEvent[] = [
            { type: "search-result", correct: true, drawingId: drawing.id, message: "Gefunden!" },
        ];

        if (searcher) {
            events.push({ type: "score-update", playerId, newScore: searcher.score, reason: "Richtig gefunden" });
        }
        if (artist) {
            events.push({ type: "score-update", playerId: artist.id, newScore: artist.score, reason: "Dein Bild wurde gefunden" });
        }

        // Send next search task
        if (assignment.activeSearchDrawingId) {
            const next = sessionState.modeState.drawings[assignment.activeSearchDrawingId];
            if (next) {
                events.push({
                    type: "assign-task",
                    task: {
                        mode: "SEARCH",
                        prompt: next.prompt,
                        drawingId: next.id,
                        artistName: sessionState.players[next.artistId]?.name || "Unbekannt",
                    },
                });
            }
        }

        return { stateChanged: true, emittedEvents: events };
    }

    // -----------------------------------------------------------------------
    // Prompt assignment (DRAW phase)
    // -----------------------------------------------------------------------

    private assignDrawPrompts(sessionState: SessionState<DrawSearchModeState>): DrawSearchServerEvent[] {
        const playerIds = Object.keys(sessionState.players);
        const shuffledPrompts = this.shuffleArray([...this.config.drawPrompts]);
        const maxPerPlayer = this.config.maxDrawingsPerRound;
        const events: DrawSearchServerEvent[] = [];

        for (const playerId of playerIds) {
            const assignment = sessionState.modeState.promptAssignments[playerId]
                ?? this.createEmptyPromptAssignment();

            const playerPrompts: string[] = [];
            for (let i = 0; i < maxPerPlayer && i < shuffledPrompts.length; i++) {
                playerPrompts.push(shuffledPrompts[i % shuffledPrompts.length]);
            }

            assignment.drawPrompts = playerPrompts;
            assignment.drawPromptIndex = 0;
            assignment.activeDrawPrompt = playerPrompts[0] ?? null;
            assignment.searchTasks = [];
            assignment.searchTaskIndex = 0;
            assignment.activeSearchDrawingId = null;

            sessionState.modeState.promptAssignments[playerId] = assignment;

            if (assignment.activeDrawPrompt) {
                events.push({
                    type: "assign-task",
                    task: { mode: "DRAW", prompt: assignment.activeDrawPrompt, drawIndex: 0, drawTotal: playerPrompts.length },
                });
            }
        }

        return events;
    }

    // -----------------------------------------------------------------------
    // Search task assignment (SEARCH phase)
    // -----------------------------------------------------------------------

    private assignSearchTasks(sessionState: SessionState<DrawSearchModeState>): DrawSearchServerEvent[] {
        const allDrawings = Object.values(sessionState.modeState.drawings);
        const events: DrawSearchServerEvent[] = [];

        for (const playerId of Object.keys(sessionState.players)) {
            const assignment = sessionState.modeState.promptAssignments[playerId];
            if (!assignment) { continue; }

            const searchable = this.shuffleArray(
                allDrawings.filter((d) => d.artistId !== playerId && !d.foundBy),
            );

            assignment.searchTasks = searchable.map((d) => ({
                drawingId: d.id,
                prompt: d.prompt,
                artistName: sessionState.players[d.artistId]?.name || "Unbekannt",
            }));
            assignment.searchTaskIndex = 0;
            assignment.activeSearchDrawingId = searchable[0]?.id ?? null;

            if (assignment.activeSearchDrawingId) {
                const first = searchable[0];
                events.push({
                    type: "assign-task",
                    task: {
                        mode: "SEARCH",
                        prompt: first.prompt,
                        drawingId: first.id,
                        artistName: sessionState.players[first.artistId]?.name || "Unbekannt",
                    },
                });
            }
        }

        return events;
    }

    // -----------------------------------------------------------------------
    // Prompt / task advancement helpers
    // -----------------------------------------------------------------------

    private activateNextDrawPrompt(assignment: DrawSearchPlayerPromptAssignment): void {
        assignment.activeDrawPrompt = assignment.drawPromptIndex < assignment.drawPrompts.length
            ? assignment.drawPrompts[assignment.drawPromptIndex]
            : null;
    }

    private activateNextSearchTask(assignment: DrawSearchPlayerPromptAssignment): void {
        assignment.activeSearchDrawingId = assignment.searchTaskIndex < assignment.searchTasks.length
            ? assignment.searchTasks[assignment.searchTaskIndex].drawingId
            : null;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private createDefaultRoundState(): DrawSearchRoundState {
        return {
            phase: "LOBBY",
            endsAt: 0,
            drawDurationSec: this.config.drawDurationSec,
            searchDurationSec: this.config.searchDurationSec,
            roundNumber: 0,
        };
    }

    private createEmptyPromptAssignment(): DrawSearchPlayerPromptAssignment {
        return {
            drawPrompts: [],
            drawPromptIndex: 0,
            activeDrawPrompt: null,
            searchTasks: [],
            searchTaskIndex: 0,
            activeSearchDrawingId: null,
        };
    }

    private recalculateEffectiveFieldSize(modeState: DrawSearchModeState): void {
        const drawingCount = Object.keys(modeState.drawings).length;
        const grownFieldSize = this.config.fieldBaseSize + drawingCount * this.config.fieldGrowthPerDrawing;
        modeState.effectiveFieldWidth = Math.min(grownFieldSize, this.config.fieldMaxSize);
        modeState.effectiveFieldHeight = modeState.effectiveFieldWidth;
    }

    private shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

