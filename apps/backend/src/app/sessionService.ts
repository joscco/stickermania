import crypto from "node:crypto";
import type { GameConfig, GameState, Player, PlayerTask, SessionInfo } from "@birthday/shared";
import { SessionGameEngine } from "../domain/sessionGameEngine.js";
import type { SessionRepository } from "../infra/sessionRepository.js";
import type { AssetRepository } from "../infra/assetRepository.js";

interface RuntimeEntry {
    engine: SessionGameEngine;
    phaseTimer: ReturnType<typeof setTimeout> | null;
}

const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateSessionCode(length: number = 5): string {
    let sessionCode = "";

    for (let index = 0; index < length; index += 1) {
        const randomIndex = Math.floor(Math.random() * SESSION_CODE_ALPHABET.length);
        sessionCode += SESSION_CODE_ALPHABET[randomIndex];
    }

    return sessionCode;
}

export class SessionService {
    private readonly runtimes = new Map<string, RuntimeEntry>();
    private onSessionStateChanged: ((sessionId: string, state: GameState) => void | Promise<void>) | null = null;

    public constructor(
        private readonly config: GameConfig,
        private readonly sessionRepository: SessionRepository,
        private readonly assetRepository: AssetRepository,
    ) {}

    public setOnSessionStateChanged(callback: (sessionId: string, state: GameState) => void | Promise<void>): void {
        this.onSessionStateChanged = callback;
    }

    public async createSession(args: { baseUrl: string }): Promise<SessionInfo> {
        const sessionId = crypto.randomUUID().slice(0, 8);
        const sessionCode = await this.generateUniqueSessionCode();

        const state = SessionGameEngine.createEmpty({
            config: this.config,
            sessionId,
            sessionCode,
        });

        await this.sessionRepository.create(state);

        const engine = new SessionGameEngine({ config: this.config, initial: state });
        this.runtimes.set(sessionId, { engine, phaseTimer: null });

        return {
            sessionId,
            sessionCode,
            playerJoinUrl: `${args.baseUrl}/#/join/${encodeURIComponent(sessionCode)}`,
            boardUrl: `${args.baseUrl}/#/board/${encodeURIComponent(sessionCode)}`,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt,
        };
    }

    public async loadState(sessionId: string): Promise<GameState | null> {
        const runtime = await this.getOrLoadRuntime(sessionId);
        return runtime?.engine.getState() ?? null;
    }

    public async reset(sessionId: string): Promise<GameState | null> {
        const runtime = await this.getOrLoadRuntime(sessionId);
        if (!runtime) {
            return null;
        }
        runtime.engine.reset();
        this.schedulePhaseTimer(sessionId, runtime);
        await this.persistRuntime(sessionId, runtime);
        return runtime.engine.getState();
    }

    public async join(args: { sessionId: string; clientId: string; kind: "player" | "board"; existingPlayerId?: string }): Promise<Player | null> {
        const runtime = await this.getOrLoadRuntime(args.sessionId);
        if (!runtime) {
            return null;
        }
        const player = runtime.engine.joinPlayer({ clientId: args.clientId, kind: args.kind, existingPlayerId: args.existingPlayerId });
        await this.persistRuntime(args.sessionId, runtime);
        return player;
    }

    public async setPlayerName(sessionId: string, playerId: string, name: string): Promise<GameState | null> {
        const runtime = await this.getOrLoadRuntime(sessionId);
        if (!runtime) {
            return null;
        }
        runtime.engine.setPlayerName(playerId, name);
        await this.persistRuntime(sessionId, runtime);
        return runtime.engine.getState();
    }

    public async saveAvatar(sessionId: string, playerId: string, avatarDataUrl: string): Promise<GameState | null> {
        const runtime = await this.getOrLoadRuntime(sessionId);
        if (!runtime) {
            return null;
        }
        const player = runtime.engine.getState().players[playerId];
        if (!player) {
            return null;
        }
        const savedAsset = await this.assetRepository.saveAvatar({
            sessionId,
            playerId,
            playerName: player.name || "player",
            imageDataUrl: avatarDataUrl,
        });
        runtime.engine.setPlayerAvatar(playerId, savedAsset.publicUrl, savedAsset.assetPath);
        await this.persistRuntime(sessionId, runtime);
        return runtime.engine.getState();
    }

    public async submitDrawing(args: { sessionId: string; playerId: string; prompt: string; imageDataUrl: string }): Promise<{ state: GameState; task: PlayerTask | null; playerName: string } | null> {
        const runtime = await this.getOrLoadRuntime(args.sessionId);
        if (!runtime) {
            return null;
        }
        const player = runtime.engine.getState().players[args.playerId];
        if (!player) {
            return null;
        }
        const drawingId = crypto.randomUUID();
        const savedAsset = await this.assetRepository.saveDrawing({
            sessionId: args.sessionId,
            playerId: args.playerId,
            playerName: player.name || "player",
            drawingId,
            prompt: args.prompt,
            imageDataUrl: args.imageDataUrl,
        });
        runtime.engine.addDrawing({
            drawingId,
            playerId: args.playerId,
            prompt: args.prompt,
            imageUrl: savedAsset.publicUrl,
            imageAssetPath: savedAsset.assetPath,
        });
        runtime.engine.clearActiveDrawPrompt(args.playerId);
        await this.persistRuntime(args.sessionId, runtime);
        return {
            state: runtime.engine.getState(),
            task: null,
            playerName: player.name || "Jemand",
        };
    }

    public async startRound(sessionId: string): Promise<GameState | null> {
        const runtime = await this.getOrLoadRuntime(sessionId);
        if (!runtime) {
            return null;
        }
        runtime.engine.startDrawPhase();
        this.schedulePhaseTimer(sessionId, runtime);
        await this.persistRuntime(sessionId, runtime);
        return runtime.engine.getState();
    }

    public async setTimerConfig(sessionId: string, drawDurationSec: number, searchDurationSec: number): Promise<GameState | null> {
        const runtime = await this.getOrLoadRuntime(sessionId);
        if (!runtime) {
            return null;
        }
        runtime.engine.setTimerConfig(drawDurationSec, searchDurationSec);
        await this.persistRuntime(sessionId, runtime);
        return runtime.engine.getState();
    }

    public async getOrLoadRuntime(sessionId: string): Promise<RuntimeEntry | null> {
        const existingRuntime = this.runtimes.get(sessionId);
        if (existingRuntime) {
            return existingRuntime;
        }
        const persistedState = await this.sessionRepository.load(sessionId);
        if (!persistedState) {
            return null;
        }
        const runtime: RuntimeEntry = {
            engine: new SessionGameEngine({ config: this.config, initial: persistedState }),
            phaseTimer: null,
        };
        this.runtimes.set(sessionId, runtime);
        this.schedulePhaseTimer(sessionId, runtime);
        return runtime;
    }

    public getAssignedTask(sessionId: string, clientId: string, mode: "DRAW" | "SEARCH"): PlayerTask | null {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) {
            return null;
        }
        return mode === "DRAW" ? runtime.engine.assignDrawTask(clientId) : runtime.engine.assignSearchTask(clientId);
    }

    public restoreTaskForPlayer(sessionId: string, playerId: string, mode: "DRAW" | "SEARCH"): PlayerTask | null {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) {
            return null;
        }
        return mode === "DRAW"
            ? runtime.engine.getCurrentDrawTaskForPlayer(playerId)
            : runtime.engine.getCurrentSearchTaskForPlayer(playerId);
    }

    public getActiveDrawPrompt(sessionId: string, playerId: string): string | null {
        const runtime = this.runtimes.get(sessionId);
        return runtime?.engine.getActiveDrawPrompt(playerId) ?? null;
    }

    public getActiveSearchDrawingId(sessionId: string, playerId: string): string | null {
        const runtime = this.runtimes.get(sessionId);
        return runtime?.engine.getActiveSearchDrawingId(playerId) ?? null;
    }

    public async checkSearchSnapshot(args: { sessionId: string; playerId: string; centerX: number; centerY: number; radius: number; expectedDrawingId: string }): Promise<{ state: GameState; correct: boolean; artist: Player | null } | null> {
        const runtime = await this.getOrLoadRuntime(args.sessionId);
        if (!runtime) {
            return null;
        }
        const result = runtime.engine.checkSearchSnapshot(args);
        if (result.correct) {
            runtime.engine.clearActiveSearchTask(args.playerId);
            await this.persistRuntime(args.sessionId, runtime);
        }
        return { state: runtime.engine.getState(), correct: result.correct, artist: result.artist };
    }

    public removeConnectionSession(sessionId: string, clientId: string): void {
        const runtime = this.runtimes.get(sessionId);
        runtime?.engine.removeSession(clientId);
    }

    public getRuntimeState(sessionId: string): GameState | null {
        return this.runtimes.get(sessionId)?.engine.getState() ?? null;
    }

    public getSessionRuntime(sessionId: string, clientId: string) {
        return this.runtimes.get(sessionId)?.engine.getSession(clientId);
    }

    public purgeDisconnectedSessions(sessionId: string, activeClientIds: Set<string>): void {
        this.runtimes.get(sessionId)?.engine.purgeDisconnectedSessions(activeClientIds);
    }

    public getAllConnectionSessions(sessionId: string) {
        return this.runtimes.get(sessionId)?.engine.getAllSessions() ?? [];
    }

    public getPlayerColors(sessionId: string, playerId: string): string[] {
        return this.runtimes.get(sessionId)?.engine.getPlayerColors(playerId) ?? [];
    }

    public getRound(sessionId: string) {
        return this.runtimes.get(sessionId)?.engine.getRound() ?? null;
    }

    public async persistSession(sessionId: string): Promise<void> {
        const runtime = this.runtimes.get(sessionId);
        if (runtime) {
            await this.persistRuntime(sessionId, runtime);
        }
    }

    public async cleanupExpiredSessions(now: number): Promise<void> {
        const expiredStates = await this.sessionRepository.listExpired(now);
        for (const expiredState of expiredStates) {
            await this.sessionRepository.delete(expiredState.sessionId);
            const runtime = this.runtimes.get(expiredState.sessionId);
            if (runtime?.phaseTimer) {
                clearTimeout(runtime.phaseTimer);
            }
            this.runtimes.delete(expiredState.sessionId);
        }
    }

    public async loadStateByCode(sessionCode: string): Promise<GameState | null> {
        const state = await this.sessionRepository.loadByCode(sessionCode);

        if (!state) {
            return null;
        }

        const runtime = await this.getOrLoadRuntime(state.sessionId);
        return runtime?.engine.getState() ?? null;
    }

    public async resolveSessionIdByCode(sessionCode: string): Promise<string | null> {
        const state = await this.sessionRepository.loadByCode(sessionCode);
        return state?.sessionId ?? null;
    }

    private async generateUniqueSessionCode(): Promise<string> {
        for (let attemptIndex = 0; attemptIndex < 20; attemptIndex += 1) {
            const sessionCode = generateSessionCode(5);
            const existingState = await this.sessionRepository.loadByCode(sessionCode);

            if (!existingState) {
                return sessionCode;
            }
        }

        throw new Error("Could not generate unique session code.");
    }

    private schedulePhaseTimer(sessionId: string, runtime: RuntimeEntry): void {
        if (runtime.phaseTimer) {
            clearTimeout(runtime.phaseTimer);
            runtime.phaseTimer = null;
        }

        const round = runtime.engine.getRound();
        if ((round.phase !== "DRAW" && round.phase !== "SEARCH") || round.endsAt <= 0) {
            return;
        }

        const delayMs = Math.max(0, round.endsAt - Date.now());
        runtime.phaseTimer = setTimeout(async () => {
            const currentRound = runtime.engine.getRound();
            if (currentRound.phase === "DRAW") {
                runtime.engine.startSearchPhase();
            } else if (currentRound.phase === "SEARCH") {
                runtime.engine.endRound();
            }
            await this.persistRuntime(sessionId, runtime);
            this.schedulePhaseTimer(sessionId, runtime);
            await this.onSessionStateChanged?.(sessionId, runtime.engine.getState());
        }, delayMs);
    }

    private async persistRuntime(_sessionId: string, runtime: RuntimeEntry): Promise<void> {
        await this.sessionRepository.save(runtime.engine.getState());
    }
}
