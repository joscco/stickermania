import crypto from "node:crypto";
import type {
    DrawSearchCaption,
    DrawSearchClientAction,
    DrawSearchDrawing,
    DrawSearchGameConfig,
    DrawSearchModeState,
    DrawSearchPlayerGuess,
    DrawSearchPlayerTask,
    DrawSearchServerEvent,
    GameConfig,
    SessionState,
} from "@birthday/shared";
import type { AssetRepository } from "../../infra/assetRepository.js";
import type { GameActionContext, GameActionResult, GameModeEngine } from "../gameModeEngine.js";

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

        events.push({ type: "round-phase", phase: ms.phase });

        if (ms.phase === "ACTIVE") {
            const player = args.sessionState.players[playerId];
            if (player?.name.trim()) {
                // Check if they already have a task (reconnect)
                const existingTask = this.playerCurrentTask.get(playerId);
                if (existingTask) {
                    events.push({ type: "assign-task", task: existingTask });
                } else {
                    // Assign a fresh task
                    const task = this.pickNextTask(playerId, args.sessionState);
                    if (task) {
                        this.playerCurrentTask.set(playerId, task);
                        events.push({ type: "assign-task", task });
                    }
                }
            }
        }

        return { stateChanged: true, emittedEvents: events };
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

        // Seed test drawings
        if (this.ds.seedTestDrawings > 0) {
            this.injectTestDrawings(ms, this.ds.seedTestDrawings, args.now);
        }

        const events: DrawSearchServerEvent[] = [
            { type: "round-phase", phase: "ACTIVE" },
        ];

        // Assign first task to each named player
        for (const playerId of Object.keys(args.sessionState.players)) {
            const player = args.sessionState.players[playerId];
            if (!player?.name.trim()) continue;

            const task = this.pickNextTask(playerId, args.sessionState);
            if (task) {
                this.playerCurrentTask.set(playerId, task);
                events.push({ type: "assign-task", task });
            }
        }

        return { stateChanged: true, emittedEvents: events };
    }

    public resetMode(args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        args.sessionState.modeState = this.createInitialState();
        this.playerCurrentTask.clear();
        return {
            stateChanged: true,
            emittedEvents: [{ type: "round-phase", phase: "LOBBY" }],
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
                return this.startMode({ sessionState: args.sessionState, now: args.context.now });

            case "submit-drawing":
                return this.handleSubmitDrawing(args.sessionState, args.context, args.action.imageDataUrl);

            case "submit-caption":
                return this.handleSubmitCaption(args.sessionState, args.context, args.action.drawingId, args.action.text);

            case "submit-guess":
                return this.handleSubmitGuess(args.sessionState, args.context, args.action.drawingId, args.action.captionId);

            default:
                return { stateChanged: false, emittedEvents: [] };
        }
    }

    // No timers in async mode
    public getNextTimerAt(): number | null {
        return null;
    }

    public onTimerElapsed(): GameActionResult<"draw-search"> {
        return { stateChanged: false, emittedEvents: [] };
    }

    // ═════════════════════════════════════════════════════════════════
    // Action handlers
    // ═════════════════════════════════════════════════════════════════

    private async handleSubmitDrawing(
        sessionState: SessionState<DrawSearchModeState>,
        context: GameActionContext,
        imageDataUrl: string,
    ): Promise<GameActionResult<"draw-search">> {
        const ms = sessionState.modeState;
        if (ms.phase !== "ACTIVE") return { stateChanged: false, emittedEvents: [] };

        const currentTask = this.playerCurrentTask.get(context.playerId);
        if (!currentTask || currentTask.mode !== "DRAW") return { stateChanged: false, emittedEvents: [] };

        const prompt = currentTask.prompt;
        const drawingId = crypto.randomUUID();
        const playerName = sessionState.players[context.playerId]?.name || "player";

        const savedAsset = await this.assetRepository.saveDrawing({
            sessionId: context.sessionId,
            playerId: context.playerId,
            playerName,
            drawingId,
            prompt,
            imageDataUrl,
        });

        const drawing: DrawSearchDrawing = {
            id: drawingId,
            artistId: context.playerId,
            prompt,
            imageUrl: savedAsset.publicUrl,
            imageAssetPath: savedAsset.assetPath,
            placedAt: context.now,
        };

        ms.drawings[drawingId] = drawing;

        // Create the "real" caption for this drawing
        const realCaptionId = `real-${drawingId}`;
        ms.captions[realCaptionId] = {
            id: realCaptionId,
            drawingId,
            text: prompt,
            authorId: "__system__",
            isReal: true,
        };

        // Assign next task
        const events: DrawSearchServerEvent[] = [];
        const nextTask = this.pickNextTask(context.playerId, sessionState);
        if (nextTask) {
            this.playerCurrentTask.set(context.playerId, nextTask);
            events.push({ type: "assign-task", task: nextTask });
        } else {
            this.playerCurrentTask.delete(context.playerId);
        }

        return { stateChanged: true, emittedEvents: events };
    }

    private handleSubmitCaption(
        sessionState: SessionState<DrawSearchModeState>,
        context: GameActionContext,
        drawingId: string,
        text: string,
    ): GameActionResult<"draw-search"> {
        const ms = sessionState.modeState;
        if (ms.phase !== "ACTIVE") return { stateChanged: false, emittedEvents: [] };

        const currentTask = this.playerCurrentTask.get(context.playerId);
        if (!currentTask || currentTask.mode !== "CAPTION" || currentTask.drawingId !== drawingId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        // Create the fake caption
        const captionId = crypto.randomUUID();
        ms.captions[captionId] = {
            id: captionId,
            drawingId,
            text: text.trim(),
            authorId: context.playerId,
            isReal: false,
        };

        // Assign next task
        const events: DrawSearchServerEvent[] = [];
        const nextTask = this.pickNextTask(context.playerId, sessionState);
        if (nextTask) {
            this.playerCurrentTask.set(context.playerId, nextTask);
            events.push({ type: "assign-task", task: nextTask });
        } else {
            this.playerCurrentTask.delete(context.playerId);
        }

        return { stateChanged: true, emittedEvents: events };
    }

    private handleSubmitGuess(
        sessionState: SessionState<DrawSearchModeState>,
        context: GameActionContext,
        drawingId: string,
        captionId: string,
    ): GameActionResult<"draw-search"> {
        const ms = sessionState.modeState;
        if (ms.phase !== "ACTIVE") return { stateChanged: false, emittedEvents: [] };

        const currentTask = this.playerCurrentTask.get(context.playerId);
        if (!currentTask || currentTask.mode !== "GUESS" || currentTask.drawingId !== drawingId) {
            return { stateChanged: false, emittedEvents: [] };
        }

        // Check correctness
        const realCaption = Object.values(ms.captions).find(
            (c) => c.drawingId === drawingId && c.isReal,
        );
        const isCorrect = captionId === realCaption?.id;

        // Store guess
        if (!ms.playerGuesses[context.playerId]) ms.playerGuesses[context.playerId] = [];
        ms.playerGuesses[context.playerId].push({
            drawingId,
            chosenCaptionId: captionId,
            playerId: context.playerId,
            isCorrect,
        });

        const events: DrawSearchServerEvent[] = [];

        // Award points
        if (isCorrect) {
            const player = sessionState.players[context.playerId];
            if (player) {
                player.score += this.ds.pointsCorrectGuess;
                events.push({
                    type: "score-update",
                    playerId: context.playerId,
                    newScore: player.score,
                    reason: "Richtig geraten!",
                });
            }
        } else {
            // Award points to the fake-caption author who fooled this player
            const chosenCaption = ms.captions[captionId];
            if (chosenCaption && !chosenCaption.isReal && chosenCaption.authorId !== "__system__") {
                const author = sessionState.players[chosenCaption.authorId];
                if (author) {
                    author.score += this.ds.pointsFooledPlayer;
                    events.push({
                        type: "score-update",
                        playerId: chosenCaption.authorId,
                        newScore: author.score,
                        reason: `Dein Fake-Titel hat ${sessionState.players[context.playerId]?.name ?? "jemanden"} getäuscht!`,
                    });
                }
            }
        }

        events.push({
            type: "guess-result",
            drawingId,
            correct: isCorrect,
            message: isCorrect ? "Richtig! 🎉" : "Falsch!",
            correctTitle: realCaption?.text ?? "???",
        });

        // Assign next task
        const nextTask = this.pickNextTask(context.playerId, sessionState);
        if (nextTask) {
            this.playerCurrentTask.set(context.playerId, nextTask);
            events.push({ type: "assign-task", task: nextTask });
        } else {
            this.playerCurrentTask.delete(context.playerId);
        }

        return { stateChanged: true, emittedEvents: events };
    }

    // ═════════════════════════════════════════════════════════════════
    // Task picker — the heart of the async flow
    // ═════════════════════════════════════════════════════════════════

    /**
     * Pick the best next task for a player. Cycle: DRAW → CAPTION → GUESS → DRAW...
     *
     * Priority:
     * 1. If there's a drawing that needs a fake caption and the player can write one → CAPTION
     * 2. If there's a drawing that's "guessable" (has enough captions) and the player hasn't guessed it → GUESS
     * 3. Otherwise → DRAW a new picture
     *
     * After a DRAW, we prefer CAPTION next. After CAPTION, we prefer GUESS. After GUESS, we prefer DRAW.
     * This ensures variety.
     */
    private pickNextTask(
        playerId: string,
        sessionState: SessionState<DrawSearchModeState>,
    ): DrawSearchPlayerTask | null {
        const ms = sessionState.modeState;
        const lastTask = this.playerCurrentTask.get(playerId);
        const lastMode = lastTask?.mode;

        // Determine what the player has already done
        const playerDrawingIds = new Set(
            Object.values(ms.drawings)
                .filter((d) => d.artistId === playerId)
                .map((d) => d.id),
        );
        const playerCaptionedDrawingIds = new Set(
            Object.values(ms.captions)
                .filter((c) => !c.isReal && c.authorId === playerId)
                .map((c) => c.drawingId),
        );
        const playerGuessedDrawingIds = new Set(
            (ms.playerGuesses[playerId] ?? []).map((g) => g.drawingId),
        );

        // Find drawings that need captions (not drawn by this player, not already captioned by them)
        const needsCaptions = Object.values(ms.drawings).filter((d) => {
            if (d.artistId === playerId) return false;
            if (playerCaptionedDrawingIds.has(d.id)) return false;
            const fakeCaptionCount = Object.values(ms.captions)
                .filter((c) => c.drawingId === d.id && !c.isReal).length;
            return fakeCaptionCount < this.ds.fakeCaptionsPerDrawing;
        });

        // Find drawings that are guessable (have enough captions, not drawn/captioned/guessed by this player)
        const guessable = Object.values(ms.drawings).filter((d) => {
            if (d.artistId === playerId) return false;
            if (playerCaptionedDrawingIds.has(d.id)) return false;
            if (playerGuessedDrawingIds.has(d.id)) return false;
            const fakeCaptionCount = Object.values(ms.captions)
                .filter((c) => c.drawingId === d.id && !c.isReal).length;
            return fakeCaptionCount >= 1; // At least 1 fake caption to make it interesting
        });

        // Preferred order based on what they just did
        const tryCaption = (): DrawSearchPlayerTask | null => {
            if (needsCaptions.length === 0) return null;
            const drawing = this.pickRandom(needsCaptions);
            return { mode: "CAPTION", drawingId: drawing.id, imageUrl: drawing.imageUrl };
        };

        const tryGuess = (): DrawSearchPlayerTask | null => {
            if (guessable.length === 0) return null;
            const drawing = this.pickRandom(guessable);
            const drawingCaptions = Object.values(ms.captions)
                .filter((c) => c.drawingId === drawing.id);
            const shuffled = this.shuffleArray(
                drawingCaptions.map((c) => ({ id: c.id, text: c.text })),
            );
            return {
                mode: "GUESS",
                drawingId: drawing.id,
                imageUrl: drawing.imageUrl,
                artistName: sessionState.players[drawing.artistId]?.name ?? "Unbekannt",
                captions: shuffled,
            };
        };

        const tryDraw = (): DrawSearchPlayerTask | null => {
            const prompt = this.pickPrompt(playerId, ms);
            return { mode: "DRAW", prompt };
        };

        // Cycle: after DRAW → try CAPTION, then GUESS, then DRAW
        //        after CAPTION → try GUESS, then DRAW, then CAPTION
        //        after GUESS → try DRAW, then CAPTION, then GUESS
        //        default (first task) → DRAW
        if (lastMode === "DRAW") {
            return tryCaption() ?? tryGuess() ?? tryDraw();
        }
        if (lastMode === "CAPTION") {
            return tryGuess() ?? tryDraw() ?? tryCaption();
        }
        if (lastMode === "GUESS") {
            return tryDraw() ?? tryCaption() ?? tryGuess();
        }

        // First task — always start with DRAW
        return tryDraw();
    }

    // ═════════════════════════════════════════════════════════════════
    // Helpers
    // ═════════════════════════════════════════════════════════════════

    /** Pick a random prompt that this player hasn't drawn yet (if possible). */
    private pickPrompt(playerId: string, ms: DrawSearchModeState): string {
        const usedPrompts = new Set(
            Object.values(ms.drawings)
                .filter((d) => d.artistId === playerId)
                .map((d) => d.prompt),
        );
        const available = this.ds.drawPrompts.filter((p) => !usedPrompts.has(p));
        const pool = available.length > 0 ? available : this.ds.drawPrompts;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    private pickRandom<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }

    private shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    private injectTestDrawings(ms: DrawSearchModeState, count: number, now: number): void {
        const testImages = [
            { file: "/assets/png/art_example_0.png", prompt: "Strandkorb im Schnee" },
            { file: "/assets/png/art_example_1.png", prompt: "Nervöser Kaktus" },
            { file: "/assets/png/art_example_2.png", prompt: "Vergesslicher Goldfisch" },
        ];

        for (let i = 0; i < count; i++) {
            const testImage = testImages[i % testImages.length];
            const drawingId = `seed-${i + 1}`;

            ms.drawings[drawingId] = {
                id: drawingId,
                artistId: "__seed__",
                prompt: testImage.prompt,
                imageUrl: testImage.file,
                imageAssetPath: "",
                placedAt: now - (count - i) * 1000,
            };

            // Create real caption
            ms.captions[`real-${drawingId}`] = {
                id: `real-${drawingId}`,
                drawingId,
                text: testImage.prompt,
                authorId: "__system__",
                isReal: true,
            };
        }
    }
}
