import crypto from "node:crypto";
import type {ClientKind, ClientToServerMessage, GameConfig, GameModeId, GameServerEnvelope, SessionInfo, SessionPlayer, SessionState,} from "@birthday/shared";
import type {AssetRepository} from "../infra/assetRepository.js";
import type {SessionRepository} from "../infra/sessionRepository.js";
import {DrawSearchEngine} from "../game-modes/draw-search/drawSearchEngine.js";
import {GardenCoopEngine} from "../game-modes/garden-coop/gardenCoopEngine.js";
import {TeamGraffitiEngine} from "../game-modes/team-graffiti/teamGraffitiEngine.js";
import {GameModeRegistry} from "../game-modes/gameModeRegistry.js";
import {SessionStateFactory} from "./sessionStateFactory.js";
import type {ConnectedClientSession, RuntimeEntry} from "./sessionRuntimeTypes.js";
import {SessionEventPublisher} from "./sessionEventPublisher.js";
import {PhaseTimerScheduler} from "./phaseTimerScheduler.js";
import {PlayerManager} from "./playerManager.js";
import {SessionLock} from "./sessionLock.js";

const SESSION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateSessionCode(length: number = 4): string {
    let sessionCode = "";
    for (let index = 0; index < length; index += 1) {
        const randomIndex = Math.floor(Math.random() * SESSION_CODE_ALPHABET.length);
        sessionCode += SESSION_CODE_ALPHABET[randomIndex];
    }
    return sessionCode;
}

export class SessionService {
    private readonly runtimes = new Map<string, RuntimeEntry>();
    private readonly gameModeRegistry = new GameModeRegistry();
    private readonly sessionStateFactory: SessionStateFactory;
    private readonly eventPublisher = new SessionEventPublisher();
    private readonly phaseTimer: PhaseTimerScheduler;
    private readonly playerManager: PlayerManager;
    private readonly sessionLock = new SessionLock();

    public constructor(
        private readonly config: GameConfig,
        private readonly sessionRepository: SessionRepository,
        private readonly assetRepository: AssetRepository,
    ) {
        this.gameModeRegistry.register(new DrawSearchEngine(config, assetRepository));
        this.gameModeRegistry.register(new GardenCoopEngine());
        this.gameModeRegistry.register(new TeamGraffitiEngine(config));

        this.sessionStateFactory = new SessionStateFactory(config, this.gameModeRegistry);

        this.phaseTimer = new PhaseTimerScheduler(
            this.runtimes,
            sessionRepository,
            this.gameModeRegistry,
            this.eventPublisher,
            this.sessionLock,
        );

        this.playerManager = new PlayerManager(
            sessionRepository,
            assetRepository,
            this.gameModeRegistry,
            this.sessionStateFactory,
            this.eventPublisher,
            this.runtimes,
            this.sessionLock,
        );
    }

    // ─── Event callback registration (delegated to publisher) ────────

    public setOnSessionStateChanged(callback: (sessionId: string, state: SessionState) => void | Promise<void>): void {
        this.eventPublisher.setOnSessionStateChanged(callback);
    }

    public setOnSessionGameEvents(callback: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>): void {
        this.eventPublisher.setOnSessionGameEvents(callback);
    }

    // ─── Session CRUD ────────────────────────────────────────────────

    public async createSession(args: {baseUrl: string; initialMode?: GameModeId}): Promise<SessionInfo> {
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
        if (!existing) return false;

        this.phaseTimer.clear(sessionId);
        await this.sessionRepository.delete(sessionId);
        this.runtimes.delete(sessionId);
        return true;
    }

    // ─── Player management (delegated) ──────────────────────────────

    public async join(args: {
        sessionId: string;
        clientId: string;
        kind: ClientKind;
        existingPlayerId?: string;
    }): Promise<{state: SessionState; player: SessionPlayer; gameEvents: any[]} | null> {
        const result = await this.playerManager.join(args);
        // Re-schedule the phase timer after join/reconnect so accrual keeps running
        if (result) {
            this.phaseTimer.schedule(args.sessionId, result.state);
        }
        return result;
    }

    public async setPlayerName(sessionId: string, playerId: string, name: string): Promise<SessionState | null> {
        return this.playerManager.setPlayerName(sessionId, playerId, name);
    }

    public async saveAvatar(sessionId: string, playerId: string, avatarDataUrl: string): Promise<SessionState | null> {
        return this.playerManager.saveAvatar(sessionId, playerId, avatarDataUrl);
    }

    public removeConnectionSession(sessionId: string, clientId: string): void {
        this.playerManager.removeConnection(sessionId, clientId);
    }

    public async markPlayerDisconnected(sessionId: string, playerId: string): Promise<void> {
        return this.playerManager.markDisconnected(sessionId, playerId);
    }

    // ─── Game-mode orchestration ────────────────────────────────────

    public async selectMode(sessionId: string, mode: GameModeId): Promise<SessionState | null> {
        return this.sessionLock.run(sessionId, async () => {
            const state = await this.sessionRepository.load(sessionId);
            if (!state) return null;

            this.phaseTimer.clear(sessionId);

            state.activeMode = mode;
            state.modeState = this.gameModeRegistry.createInitialModeState(mode);

            const runtime = this.getOrCreateRuntime(state);
            runtime.sessionRuntime.activeMode = mode;

            this.eventPublisher.bumpRevision(state);
            await this.sessionRepository.save(state);
            await this.eventPublisher.publishState(state);
            return state;
        });
    }

    public async startMode(sessionId: string): Promise<SessionState | null> {
        return this.sessionLock.run(sessionId, async () => {
            const state = await this.sessionRepository.load(sessionId);
            if (!state) return null;

            const engine = this.gameModeRegistry.get(state.activeMode);
            const result = engine.startMode({sessionState: state as never, now: Date.now()});

            if (result.stateChanged) {
                this.eventPublisher.bumpRevision(state);
                await this.sessionRepository.save(state);
                await this.eventPublisher.publishState(state);
            }

            if (result.emittedEvents.length > 0) {
                await this.eventPublisher.publishGameEvents(sessionId, state.activeMode, result.emittedEvents as never[]);
            }

            this.phaseTimer.schedule(sessionId, state);
            return state;
        });
    }

    public async resetSession(sessionId: string): Promise<SessionState | null> {
        return this.sessionLock.run(sessionId, async () => {
            const state = await this.sessionRepository.load(sessionId);
            if (!state) return null;

            this.phaseTimer.clear(sessionId);

            const engine = this.gameModeRegistry.get(state.activeMode);
            const result = engine.resetMode({sessionState: state as never, now: Date.now()});

            if (result.stateChanged) {
                this.eventPublisher.bumpRevision(state);
                await this.sessionRepository.save(state);
                await this.eventPublisher.publishState(state);
            }

            if (result.emittedEvents.length > 0) {
                await this.eventPublisher.publishGameEvents(sessionId, state.activeMode, result.emittedEvents as never[]);
            }

            return state;
        });
    }

    public async handleGameAction(args: {
        sessionId: string;
        clientId: string;
        playerId: string;
        clientKind: ClientKind;
        message: Extract<ClientToServerMessage, {type: "game-action"}>;
    }): Promise<SessionState | null> {
        return this.sessionLock.run(args.sessionId, async () => {
            const state = await this.sessionRepository.load(args.sessionId);
            if (!state) return null;

            if (state.activeMode !== args.message.mode) return state;

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
                this.eventPublisher.bumpRevision(state);
                await this.sessionRepository.save(state);
                await this.eventPublisher.publishState(state);
            }

            if (result.emittedEvents.length > 0) {
                await this.eventPublisher.publishGameEvents(state.sessionId, state.activeMode, result.emittedEvents as never[]);
            }

            this.phaseTimer.schedule(args.sessionId, state);
            return state;
        });
    }

    // ─── Internals ──────────────────────────────────────────────────

    private getOrCreateRuntime(state: SessionState): RuntimeEntry {
        const existing = this.runtimes.get(state.sessionId);
        if (existing) return existing;

        const created: RuntimeEntry = {
            sessionRuntime: {
                activeMode: state.activeMode,
                connectedClients: new Map<string, ConnectedClientSession>(),
            },
            phaseTimer: null,
        };

        this.runtimes.set(state.sessionId, created);
        return created;
    }

    private async generateUniqueSessionCode(): Promise<string> {
        for (let attemptIndex = 0; attemptIndex < 20; attemptIndex += 1) {
            const sessionCode = generateSessionCode();
            const existingState = await this.sessionRepository.loadByCode(sessionCode);
            if (!existingState) return sessionCode;
        }
        throw new Error("Could not generate unique session code");
    }
}
