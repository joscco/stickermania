import crypto from "node:crypto";
import type {
    DrawSearchClientAction,
    DrawSearchDrawing,
    DrawSearchGamePhase,
    DrawSearchModeState,
    DrawSearchMuseumSlot,
    DrawSearchPlayerPromptAssignment,
    DrawSearchRoundState,
    DrawSearchServerEvent,
    GameConfig,
    SessionState,
} from "@birthday/shared";
import { clampInt } from "@birthday/shared";
import type { AssetRepository } from "../../infra/assetRepository.js";
import type { GameActionContext, GameActionResult, GameModeEngine } from "../gameModeEngine.js";

/**
 * Minimum number of drawings (from different artists) before any player
 * can enter SEARCH phase. This prevents the "nothing to search" problem.
 */
const MIN_DRAWINGS_FOR_SEARCH = 3;

export class DrawSearchEngine implements GameModeEngine<"draw-search", DrawSearchModeState> {
    public readonly mode = "draw-search" as const;

    public constructor(
        private readonly config: GameConfig,
        private readonly assetRepository: AssetRepository,
    ) {}

    public createInitialState(): DrawSearchModeState {
        return {
            mode: "draw-search",
            drawings: {},
            museumSlots: [],
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

        const events: DrawSearchServerEvent[] = [this.createConfigEvent(args.sessionState.modeState)];

        // If the game is ACTIVE and the new player has a name, assign them a draw task immediately
        if (playerId && args.sessionState.modeState.round.phase === "ACTIVE") {
            const player = args.sessionState.players[playerId];
            if (player && player.name.trim().length > 0) {
                const assignEvents = this.assignNextDrawPrompt(playerId, args.sessionState);
                events.push(...assignEvents);
            }
        }

        return {
            stateChanged: true,
            emittedEvents: events,
        };
    }

    public startMode(args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        const modeState = args.sessionState.modeState;

        // Start with a modest field size; it grows dynamically as drawings are added
        const initialDrawingEstimate = Math.max(4, Object.keys(args.sessionState.players).length * 2);
        const effectiveFieldSize = this.calculateFieldSizeForDrawingCount(initialDrawingEstimate);

        modeState.drawings = {};
        modeState.museumSlots = this.generateMuseumSlots(initialDrawingEstimate, effectiveFieldSize, effectiveFieldSize);
        modeState.effectiveFieldWidth = effectiveFieldSize;
        modeState.effectiveFieldHeight = effectiveFieldSize;
        modeState.round.phase = "ACTIVE";
        modeState.round.endsAt = 0; // no global timer
        modeState.round.roundNumber += 1;

        const events: DrawSearchServerEvent[] = [this.createConfigEvent(modeState)];

        // Give each player their first draw prompt
        for (const playerId of Object.keys(args.sessionState.players)) {
            const assignEvents = this.assignNextDrawPrompt(playerId, args.sessionState);
            events.push(...assignEvents);
        }

        events.push({
            type: "round-phase",
            phase: "ACTIVE",
            endsAt: 0,
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

        return {
            stateChanged: true,
            emittedEvents: [this.createConfigEvent(args.sessionState.modeState)],
        };
    }

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
                return { stateChanged: true, emittedEvents: [this.createConfigEvent(args.sessionState.modeState)] };
            }

            case "submit-drawing":
                return await this.handleSubmitDrawing(args.sessionState, args.context, args.action.imageDataUrl);

            case "search-snapshot":
                return this.handleSearchSnapshot(
                    args.sessionState,
                    args.context.playerId,
                    args.action.centerX,
                    args.action.centerY,
                    args.action.radius,
                    args.context.now,
                );

            default:
                return { stateChanged: false, emittedEvents: [] };
        }
    }

    /**
     * No global timers in per-player mode.
     */
    public getNextTimerAt(_args: {
        sessionState: SessionState<DrawSearchModeState>;
    }): number | null {
        return null;
    }

    public onTimerElapsed(_args: {
        sessionState: SessionState<DrawSearchModeState>;
        now: number;
    }): GameActionResult<"draw-search"> {
        return { stateChanged: false, emittedEvents: [] };
    }

    // ─── Per-player flow ──────────────────────────────────────────────

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

        const savedAsset = await this.assetRepository.saveDrawing({
            sessionId: context.sessionId,
            playerId: context.playerId,
            playerName,
            drawingId,
            prompt,
            imageDataUrl,
        });

        // Grow field & add new slots if needed
        this.growFieldIfNeeded(sessionState.modeState);

        const assignedSlot = this.getNextFreeMuseumSlot(sessionState.modeState);
        const fallbackPosition = this.createFallbackPosition(sessionState.modeState);

        const drawing: DrawSearchDrawing = {
            id: drawingId,
            artistId: context.playerId,
            prompt,
            imageUrl: savedAsset.publicUrl,
            imageAssetPath: savedAsset.assetPath,
            x: assignedSlot?.x ?? fallbackPosition.x,
            y: assignedSlot?.y ?? fallbackPosition.y,
            slotId: assignedSlot?.id ?? null,
            placedAt: context.now,
            foundBy: null,
            foundAt: null,
        };

        sessionState.modeState.drawings[drawingId] = drawing;

        assignment.activeDrawPrompt = null;
        assignment.drawPromptIndex += 1;

        const events: DrawSearchServerEvent[] = [];

        // Transition THIS player to SEARCH
        const searchEvents = this.transitionPlayerToSearch(context.playerId, sessionState);
        events.push(...searchEvents);

        // Check if any other players in IDLE can now start searching
        // (they might have been waiting for enough drawings)
        const wakeUpEvents = this.wakeUpIdlePlayers(sessionState, context.playerId);
        events.push(...wakeUpEvents);

        return { stateChanged: true, emittedEvents: events };
    }

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

        if (drawing.artistId === playerId) {
            return {
                stateChanged: false,
                emittedEvents: [{ type: "search-result", correct: false, drawingId: drawing.id, message: "Eigene Bilder zählen nicht." }],
            };
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

        const events: DrawSearchServerEvent[] = [
            { type: "search-result", correct: true, drawingId: drawing.id, message: "Gefunden!" },
        ];

        if (searcher) {
            events.push({ type: "score-update", playerId, newScore: searcher.score, reason: "Richtig gefunden" });
        }
        if (artist) {
            events.push({ type: "score-update", playerId: artist.id, newScore: artist.score, reason: "Dein Bild wurde gefunden" });
        }

        // Check if there are more search tasks for this player
        assignment.activeSearchDrawingId = null;
        assignment.searchTaskIndex += 1;
        this.activateNextSearchTask(assignment);

        if (assignment.activeSearchDrawingId) {
            // Player has more drawings to find
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
        } else {
            // Player finished searching → transition back to DRAW
            assignment.cycleIndex += 1;
            const drawEvents = this.assignNextDrawPrompt(playerId, sessionState);
            events.push(...drawEvents);
        }

        return { stateChanged: true, emittedEvents: events };
    }

    // ─── Player transition helpers ───────────────────────────────────

    /**
     * Transition a player from DRAW to SEARCH.
     * If not enough drawings exist yet, put them in IDLE.
     */
    private transitionPlayerToSearch(playerId: string, sessionState: SessionState<DrawSearchModeState>): DrawSearchServerEvent[] {
        const assignment = sessionState.modeState.promptAssignments[playerId];
        if (!assignment) return [];

        const allDrawings = Object.values(sessionState.modeState.drawings);
        const searchable = this.shuffleArray(
            allDrawings.filter((d) => d.artistId !== playerId && !d.foundBy),
        );

        // Check if there are enough drawings from other artists
        const uniqueArtists = new Set(allDrawings.map((d) => d.artistId));
        const hasEnoughDrawings = allDrawings.length >= MIN_DRAWINGS_FOR_SEARCH && uniqueArtists.size >= 2;

        if (!hasEnoughDrawings || searchable.length === 0) {
            // Not enough to search yet → IDLE
            assignment.playerPhase = "IDLE";
            assignment.searchTasks = [];
            assignment.searchTaskIndex = 0;
            assignment.activeSearchDrawingId = null;
            return [{ type: "player-phase", playerId, playerPhase: "IDLE" }];
        }

        // Assign search tasks
        assignment.playerPhase = "SEARCH";
        assignment.searchTasks = searchable.map((drawing) => ({
            drawingId: drawing.id,
            prompt: drawing.prompt,
            artistName: sessionState.players[drawing.artistId]?.name || "Unbekannt",
        }));
        assignment.searchTaskIndex = 0;
        assignment.activeSearchDrawingId = searchable[0]?.id ?? null;

        const events: DrawSearchServerEvent[] = [
            { type: "player-phase", playerId, playerPhase: "SEARCH" },
        ];

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

        return events;
    }

    /**
     * Assign the next draw prompt to a player and set their phase to DRAW.
     */
    private assignNextDrawPrompt(playerId: string, sessionState: SessionState<DrawSearchModeState>): DrawSearchServerEvent[] {
        const assignment = sessionState.modeState.promptAssignments[playerId] ?? this.createEmptyPromptAssignment();
        sessionState.modeState.promptAssignments[playerId] = assignment;

        // Pick next prompt from the infinite pool
        const prompt = this.pickNextPrompt(assignment);
        assignment.activeDrawPrompt = prompt;
        assignment.playerPhase = "DRAW";

        // Ensure drawPrompts tracks what we've assigned
        if (prompt) {
            if (assignment.drawPromptIndex >= assignment.drawPrompts.length) {
                assignment.drawPrompts.push(prompt);
            }
        }

        const events: DrawSearchServerEvent[] = [
            { type: "player-phase", playerId, playerPhase: "DRAW" },
        ];

        if (prompt) {
            events.push({
                type: "assign-task",
                task: {
                    mode: "DRAW",
                    prompt,
                    drawIndex: assignment.cycleIndex,
                    drawTotal: assignment.cycleIndex + 1, // grows infinitely
                },
            });
        }

        return events;
    }

    /**
     * Wake up any IDLE players who were waiting for enough drawings.
     */
    private wakeUpIdlePlayers(sessionState: SessionState<DrawSearchModeState>, excludePlayerId?: string): DrawSearchServerEvent[] {
        const events: DrawSearchServerEvent[] = [];
        const allDrawings = Object.values(sessionState.modeState.drawings);
        const uniqueArtists = new Set(allDrawings.map((d) => d.artistId));

        if (allDrawings.length < MIN_DRAWINGS_FOR_SEARCH || uniqueArtists.size < 2) {
            return events;
        }

        for (const [playerId, assignment] of Object.entries(sessionState.modeState.promptAssignments)) {
            if (playerId === excludePlayerId) continue;
            if (assignment.playerPhase !== "IDLE") continue;

            // Try to transition them to SEARCH
            const searchable = allDrawings.filter((d) => d.artistId !== playerId && !d.foundBy);
            if (searchable.length === 0) continue;

            const transitionEvents = this.transitionPlayerToSearch(playerId, sessionState);
            events.push(...transitionEvents);
        }

        return events;
    }

    // ─── Field growth ────────────────────────────────────────────────

    private growFieldIfNeeded(modeState: DrawSearchModeState): void {
        const drawingCount = Object.keys(modeState.drawings).length + 1; // +1 for the one about to be placed
        const newFieldSize = this.calculateFieldSizeForDrawingCount(drawingCount);

        if (newFieldSize > modeState.effectiveFieldWidth) {
            // Add more museum slots for the expanded space
            const currentSlotCount = modeState.museumSlots.length;
            const neededSlots = drawingCount + 4; // some buffer

            if (neededSlots > currentSlotCount) {
                const newSlots = this.generateMuseumSlots(neededSlots, newFieldSize, newFieldSize);
                // Keep existing slots, add new ones
                const existingIds = new Set(modeState.museumSlots.map((s) => s.id));
                for (const slot of newSlots) {
                    if (!existingIds.has(slot.id)) {
                        modeState.museumSlots.push(slot);
                    }
                }
                // If still not enough, just use the new full set
                if (modeState.museumSlots.length < neededSlots) {
                    modeState.museumSlots = newSlots;
                }
            }

            modeState.effectiveFieldWidth = newFieldSize;
            modeState.effectiveFieldHeight = newFieldSize;
        }
    }

    // ─── Prompt helpers ──────────────────────────────────────────────

    private pickNextPrompt(assignment: DrawSearchPlayerPromptAssignment): string | null {
        if (this.config.drawPrompts.length === 0) return null;

        // Pick a random prompt from the pool (cycling infinitely)
        const cycleIndex = assignment.cycleIndex;
        const shuffled = this.shuffleArray([...this.config.drawPrompts]);
        return shuffled[cycleIndex % shuffled.length];
    }

    private activateNextSearchTask(assignment: DrawSearchPlayerPromptAssignment): void {
        assignment.activeSearchDrawingId = assignment.searchTaskIndex < assignment.searchTasks.length
            ? assignment.searchTasks[assignment.searchTaskIndex].drawingId
            : null;
    }

    private createDefaultRoundState(): DrawSearchRoundState {
        return {
            phase: "LOBBY" as DrawSearchGamePhase,
            endsAt: 0,
            drawDurationSec: this.config.drawDurationSec,
            searchDurationSec: this.config.searchDurationSec,
            roundNumber: 0,
        };
    }

    private createEmptyPromptAssignment(): DrawSearchPlayerPromptAssignment {
        return {
            playerPhase: "IDLE",
            cycleIndex: 0,
            drawPrompts: [],
            drawPromptIndex: 0,
            activeDrawPrompt: null,
            searchTasks: [],
            searchTaskIndex: 0,
            activeSearchDrawingId: null,
        };
    }


    private calculateFieldSizeForDrawingCount(drawingCount: number): number {
        const grownFieldSize = this.config.fieldBaseSize + drawingCount * this.config.fieldGrowthPerDrawing;
        return Math.min(grownFieldSize, this.config.fieldMaxSize);
    }

    private getNextFreeMuseumSlot(modeState: DrawSearchModeState): DrawSearchMuseumSlot | null {
        const usedSlotIds = new Set(
            Object.values(modeState.drawings)
                .map((drawing) => drawing.slotId)
                .filter((slotId): slotId is string => slotId !== null),
        );

        return modeState.museumSlots.find((slot) => !usedSlotIds.has(slot.id)) ?? null;
    }

    private createFallbackPosition(modeState: DrawSearchModeState): { x: number; y: number } {
        const padding = this.config.imageSizePx;
        return {
            x: padding + Math.random() * Math.max(1, modeState.effectiveFieldWidth - padding * 2),
            y: padding + Math.random() * Math.max(1, modeState.effectiveFieldHeight - padding * 2),
        };
    }

    private generateMuseumSlots(slotCount: number, fieldWidth: number, fieldHeight: number): DrawSearchMuseumSlot[] {
        if (slotCount <= 0) {
            return [];
        }

        const slots: DrawSearchMuseumSlot[] = [];
        const frameWidth = this.config.imageSizePx * 1.25;
        const frameHeight = this.config.imageSizePx * 1.25;
        const minDistance = Math.max(frameWidth, frameHeight) * 1.7;
        const marginX = frameWidth * 0.9;
        const marginY = frameHeight * 0.9;

        for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
            let bestCandidate: DrawSearchMuseumSlot | null = null;
            let bestDistanceScore = -Infinity;

            for (let attemptIndex = 0; attemptIndex < 200; attemptIndex += 1) {
                const candidateX = marginX + Math.random() * Math.max(1, fieldWidth - marginX * 2);
                const candidateY = marginY + Math.random() * Math.max(1, fieldHeight - marginY * 2);
                const nearestDistance = slots.reduce((nearest, existingSlot) => {
                    const deltaX = existingSlot.x - candidateX;
                    const deltaY = existingSlot.y - candidateY;
                    return Math.min(nearest, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
                }, Number.POSITIVE_INFINITY);

                const distanceScore = Number.isFinite(nearestDistance) ? nearestDistance : minDistance * 2;
                const edgeBias = Math.min(candidateX, fieldWidth - candidateX, candidateY, fieldHeight - candidateY);
                const candidateScore = distanceScore * 5 + edgeBias;

                if (distanceScore < minDistance && attemptIndex < 180) {
                    continue;
                }

                if (candidateScore > bestDistanceScore) {
                    bestDistanceScore = candidateScore;
                    bestCandidate = {
                        id: `slot-${slotIndex + 1}`,
                        x: candidateX,
                        y: candidateY,
                        rotationDeg: -4 + Math.random() * 8,
                    };
                }
            }

            if (bestCandidate) {
                slots.push(bestCandidate);
            }
        }

        return slots;
    }

    private createConfigEvent(modeState: DrawSearchModeState): DrawSearchServerEvent {
        return {
            type: "draw-search-config",
            fieldWidth: modeState.effectiveFieldWidth,
            fieldHeight: modeState.effectiveFieldHeight,
            maxDrawingsPerRound: this.config.maxDrawingsPerRound,
            searchOverscroll: this.config.searchOverscroll,
            initialZoom: 1,
            imageSizePx: this.config.imageSizePx,
            fieldBaseSize: this.config.fieldBaseSize,
            fieldGrowthPerDrawing: this.config.fieldGrowthPerDrawing,
            fieldMaxSize: this.config.fieldMaxSize,
        };
    }

    private shuffleArray<T>(array: T[]): T[] {
        for (let index = array.length - 1; index > 0; index -= 1) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [array[index], array[randomIndex]] = [array[randomIndex], array[index]];
        }
        return array;
    }
}
