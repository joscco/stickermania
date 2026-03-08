import crypto from "node:crypto";
import type {ClientKind, ClientToServerMessage, GameConfig, GameModeId, GameServerEnvelope, SessionInfo, SessionPlayer, SessionState,} from "@birthday/shared";
import type {AssetRepository} from "../infra/assetRepository.js";
import type {SessionRepository} from "../infra/sessionRepository.js";
import {DrawSearchEngine} from "../game-modes/draw-search/drawSearchEngine.js";
import {GardenCoopEngine} from "../game-modes/garden-coop/gardenCoopEngine.js";
import {SessionStateFactory} from "./sessionStateFactory.js";
import {TeamGraffitiEngine} from "../game-modes/team-graffiti/teamGraffitiEngine.js";
import type {ConnectedClientSession, RuntimeEntry} from "./sessionRuntimeTypes.js";
import {GameModeRegistry} from "../game-modes/gameModeRegistry.js";

const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateSessionCode(length: number = 5): string {
    let sessionCode = "";

    for (let index = 0; index < length; index += 1) {
        const randomIndex = Math.floor(Math.random() * SESSION_CODE_ALPHABET.length);
        sessionCode += SESSION_CODE_ALPHABET[randomIndex];
    }

    return sessionCode;
}

export interface SessionServiceEvents {
    onSessionStateChanged?: (sessionId: string, state: SessionState) => void | Promise<void>;
    onSessionGameEvents?: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>;
}

export class SessionService {
    private readonly runtimes = new Map<string, RuntimeEntry>();
    private readonly gameModeRegistry = new GameModeRegistry();
    private readonly sessionStateFactory: SessionStateFactory;
    private readonly serviceEvents: SessionServiceEvents = {};

    public constructor(
        private readonly config: GameConfig,
        private readonly sessionRepository: SessionRepository,
        private readonly assetRepository: AssetRepository,
    ) {
        this.gameModeRegistry.register(new DrawSearchEngine(config, assetRepository));
        this.gameModeRegistry.register(new GardenCoopEngine());
        this.gameModeRegistry.register(new TeamGraffitiEngine());

        this.sessionStateFactory = new SessionStateFactory(config, this.gameModeRegistry);
    }

    public setOnSessionStateChanged(callback: (sessionId: string, state: SessionState) => void | Promise<void>): void {
        this.serviceEvents.onSessionStateChanged = callback;
    }

    public setOnSessionGameEvents(callback: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>): void {
        this.serviceEvents.onSessionGameEvents = callback;
    }

    // -----------------------------------------------------------------------
    // Session CRUD
    // -----------------------------------------------------------------------

    public async createSession(args: { baseUrl: string; initialMode?: GameModeId }): Promise<SessionInfo> {
        const sessionId = crypto.randomUUID().slice(0, 8);
        const sessionCode = await this.generateUniqueSessionCode();

        const state = this.sessionStateFactory.createEmpty({
            sessionId,
            sessionCode,
            initialMode: args.initialMode ?? "draw-search",
        });

        await this.sessionRepository.create(state);
        this.runtimes.set(sessionId, {
            sessionRuntime: {
                activeMode: state.activeMode,
                connectedClients: new Map<string, ConnectedClientSession>(),
            },
            phaseTimer: null,
        });

        return {
            sessionId,
            sessionCode,
            playerJoinUrl: `${args.baseUrl}/#/join/${encodeURIComponent(sessionCode)}`,
            boardUrl: `${args.baseUrl}/#/board/${encodeURIComponent(sessionCode)}`,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt,
        };
    }

    public async listSessions(): Promise<SessionState[]> {
        const allSessions = await this.sessionRepository.listAll();
        return allSessions
            .filter((session) => session.expiresAt > Date.now())
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    public async loadState(sessionId: string): Promise<SessionState | null> {
        return await this.sessionRepository.load(sessionId);
    }

    public async loadStateByCode(sessionCode: string): Promise<SessionState | null> {
        return await this.sessionRepository.loadByCode(sessionCode);
    }

    public async deleteSession(sessionId: string): Promise<boolean> {
        const existing = await this.sessionRepository.load(sessionId);

        if (!existing) {
            return false;
        }

        this.clearPhaseTimer(sessionId);
        await this.sessionRepository.delete(sessionId);
        this.runtimes.delete(sessionId);
        return true;
    }

    public async join(args: {
        sessionId: string;
        clientId: string;
        kind: ClientKind;
        existingPlayerId?: string;
    }): Promise<{ state: SessionState; player: SessionPlayer } | null> {
        const state = await this.requireState(args.sessionId);

        if (!state) {
            return null;
        }

        const runtime = this.getOrCreateRuntime(state);

        // Board clients are spectators — they don't create or use players
        if (args.kind === "board") {
            runtime.sessionRuntime.connectedClients.set(args.clientId, {
                playerId: "__board__",
                clientId: args.clientId,
                kind: args.kind,
                connectedAt: Date.now(),
            });

            // Return a dummy player entry for the board (not stored in state.players)
            return {
                state,
                player: {
                    id: "__board__",
                    name: "Board",
                    avatarUrl: null,
                    avatarAssetPath: null,
                    score: 0,
                    joinedAt: Date.now(),
                    connected: true,
                    isHost: false,
                    teamId: null,
                },
            };
        }

        // Player clients
        let player = args.existingPlayerId ? state.players[args.existingPlayerId] : undefined;

        if (!player) {
            const playerId = crypto.randomUUID();
            const isFirstPlayer = Object.keys(state.players).length === 0;
            player = this.sessionStateFactory.createPlayer({
                playerId,
                isHost: isFirstPlayer,
            });
            state.players[player.id] = player;
        }

        player.connected = true;

        runtime.sessionRuntime.connectedClients.set(args.clientId, {
            playerId: player.id,
            clientId: args.clientId,
            kind: args.kind,
            connectedAt: Date.now(),
        });

        const engine = this.gameModeRegistry.get(state.activeMode);
        const result = engine.onPlayerJoined({
            sessionState: state as never,
            player,
            connectedClient: runtime.sessionRuntime.connectedClients.get(args.clientId)!,
            now: Date.now(),
        });

        this.bumpRevision(state);

        await this.persistState(state);
        await this.publishState(state);

        if (result.emittedEvents.length > 0) {
            await this.publishGameEvents(state.sessionId, state.activeMode, result.emittedEvents as never[]);
        }

        return {
            state,
            player,
        };
    }

    public async setPlayerName(sessionId: string, playerId: string, name: string): Promise<SessionState | null> {
        const state = await this.requireState(sessionId);

        if (!state) {
            return null;
        }

        const player = state.players[playerId];

        if (!player) {
            return null;
        }

        player.name = name.trim().slice(0, 24);
        this.bumpRevision(state);
        await this.persistState(state);
        await this.publishState(state);
        return state;
    }

    public async saveAvatar(sessionId: string, playerId: string, avatarDataUrl: string): Promise<SessionState | null> {
        const state = await this.requireState(sessionId);

        if (!state) {
            return null;
        }

        const player = state.players[playerId];

        if (!player) {
            return null;
        }

        const savedAsset = await this.assetRepository.saveAvatar({
            sessionId,
            playerId,
            playerName: player.name || "player",
            imageDataUrl: avatarDataUrl,
        });

        player.avatarUrl = savedAsset.publicUrl;
        player.avatarAssetPath = savedAsset.assetPath;

        this.bumpRevision(state);
        await this.persistState(state);
        await this.publishState(state);
        return state;
    }

    public removeConnectionSession(sessionId: string, clientId: string): void {
        const runtime = this.runtimes.get(sessionId);

        if (!runtime) {
            return;
        }

        runtime.sessionRuntime.connectedClients.delete(clientId);
    }

    public async markPlayerDisconnected(sessionId: string, playerId: string): Promise<void> {
        const state = await this.requireState(sessionId);

        if (!state) {
            return;
        }

        const player = state.players[playerId];

        if (!player || !player.connected) {
            return;
        }

        player.connected = false;
        this.bumpRevision(state);
        await this.persistState(state);
        await this.publishState(state);
    }

    public async selectMode(sessionId: string, mode: GameModeId): Promise<SessionState | null> {
        const state = await this.requireState(sessionId);

        if (!state) {
            return null;
        }

        this.clearPhaseTimer(sessionId);

        state.activeMode = mode;
        state.modeState = this.gameModeRegistry.createInitialModeState(mode);

        const runtime = this.getOrCreateRuntime(state);
        runtime.sessionRuntime.activeMode = mode;

        this.bumpRevision(state);
        await this.persistState(state);
        await this.publishState(state);
        return state;
    }

    public async startMode(sessionId: string): Promise<SessionState | null> {
        const state = await this.requireState(sessionId);

        if (!state) {
            return null;
        }

        const engine = this.gameModeRegistry.get(state.activeMode);
        const result = engine.startMode({
            sessionState: state as never,
            now: Date.now(),
        });

        if (result.stateChanged) {
            this.bumpRevision(state);
            await this.persistState(state);
            await this.publishState(state);
        }

        if (result.emittedEvents.length > 0) {
            await this.publishGameEvents(sessionId, state.activeMode, result.emittedEvents as never[]);
        }

        this.schedulePhaseTimer(sessionId, state);

        return state;
    }

    public async resetSession(sessionId: string): Promise<SessionState | null> {
        const state = await this.requireState(sessionId);

        if (!state) {
            return null;
        }

        this.clearPhaseTimer(sessionId);

        const engine = this.gameModeRegistry.get(state.activeMode);
        const result = engine.resetMode({
            sessionState: state as never,
            now: Date.now(),
        });

        if (result.stateChanged) {
            this.bumpRevision(state);
            await this.persistState(state);
            await this.publishState(state);
        }

        if (result.emittedEvents.length > 0) {
            await this.publishGameEvents(sessionId, state.activeMode, result.emittedEvents as never[]);
        }

        return state;
    }

    public async handleGameAction(args: {
        sessionId: string;
        clientId: string;
        playerId: string;
        clientKind: ClientKind;
        message: Extract<ClientToServerMessage, { type: "game-action" }>;
    }): Promise<SessionState | null> {
        const state = await this.requireState(args.sessionId);

        if (!state) {
            return null;
        }

        if (state.activeMode !== args.message.mode) {
            return state;
        }

        const engine = this.gameModeRegistry.get(state.activeMode);
        const result = await engine.applyAction({
            sessionState: state as never,
            action: args.message.action as never,
            context: {
                sessionId: args.sessionId,
                playerId: args.playerId,
                clientId: args.clientId,
                clientKind: args.clientKind,
                now: Date.now(),
            },
        });

        if (result.stateChanged) {
            this.bumpRevision(state);
            await this.persistState(state);
            await this.publishState(state);
        }

        if (result.emittedEvents.length > 0) {
            await this.publishGameEvents(state.sessionId, state.activeMode, result.emittedEvents as never[]);
        }

        this.schedulePhaseTimer(args.sessionId, state);

        return state;
    }

    // -----------------------------------------------------------------------
    // Phase timer scheduling
    // -----------------------------------------------------------------------

    private schedulePhaseTimer(sessionId: string, state: SessionState): void {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) {
            return;
        }

        // Clear any existing timer
        this.clearPhaseTimer(sessionId);

        const engine = this.gameModeRegistry.get(state.activeMode);
        if (!engine.getNextTimerAt) {
            return;
        }

        const nextTimerAt = engine.getNextTimerAt({ sessionState: state as never, now: Date.now() });
        if (nextTimerAt === null) {
            return;
        }

        const delayMs = Math.max(0, nextTimerAt - Date.now());

        runtime.phaseTimer = setTimeout(async () => {
            runtime.phaseTimer = null;

            if (!engine.onTimerElapsed) {
                return;
            }

            // Re-load state to get the latest version
            const currentState = await this.requireState(sessionId);
            if (!currentState) {
                return;
            }

            const result = await engine.onTimerElapsed({
                sessionState: currentState as never,
                now: Date.now(),
            });

            if (result.stateChanged) {
                this.bumpRevision(currentState);
                await this.persistState(currentState);
                await this.publishState(currentState);
            }

            if (result.emittedEvents.length > 0) {
                await this.publishGameEvents(sessionId, currentState.activeMode, result.emittedEvents as never[]);
            }

            // Recurse: schedule the next timer (e.g. DRAW → SEARCH → PAUSED)
            this.schedulePhaseTimer(sessionId, currentState);
        }, delayMs);
    }

    private clearPhaseTimer(sessionId: string): void {
        const runtime = this.runtimes.get(sessionId);
        if (runtime?.phaseTimer) {
            clearTimeout(runtime.phaseTimer);
            runtime.phaseTimer = null;
        }
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    private getOrCreateRuntime(state: SessionState): RuntimeEntry {
        const existingRuntime = this.runtimes.get(state.sessionId);

        if (existingRuntime) {
            return existingRuntime;
        }

        const createdRuntime: RuntimeEntry = {
            sessionRuntime: {
                activeMode: state.activeMode,
                connectedClients: new Map<string, ConnectedClientSession>(),
            },
            phaseTimer: null,
        };

        this.runtimes.set(state.sessionId, createdRuntime);
        return createdRuntime;
    }

    private async requireState(sessionId: string): Promise<SessionState | null> {
        return await this.sessionRepository.load(sessionId);
    }

    private bumpRevision(state: SessionState): void {
        state.revision += 1;
        state.updatedAt = Date.now();
    }

    private async persistState(state: SessionState): Promise<void> {
        await this.sessionRepository.save(state);
    }

    private async publishState(state: SessionState): Promise<void> {
        if (this.serviceEvents.onSessionStateChanged) {
            await this.serviceEvents.onSessionStateChanged(state.sessionId, state);
        }
    }

    private async publishGameEvents<TMode extends GameModeId>(
        sessionId: string,
        mode: TMode,
        events: Array<any>,
    ): Promise<void> {
        if (!this.serviceEvents.onSessionGameEvents) {
            return;
        }

        const wrappedEvents: GameServerEnvelope[] = events.map((event) => ({
            type: "game-event",
            mode,
            event,
        })) as GameServerEnvelope[];

        await this.serviceEvents.onSessionGameEvents(sessionId, wrappedEvents);
    }

    private async generateUniqueSessionCode(): Promise<string> {
        for (let attemptIndex = 0; attemptIndex < 20; attemptIndex += 1) {
            const sessionCode = generateSessionCode();
            const existingState = await this.sessionRepository.loadByCode(sessionCode);

            if (!existingState) {
                return sessionCode;
            }
        }

        throw new Error("Could not generate unique session code");
    }
}

