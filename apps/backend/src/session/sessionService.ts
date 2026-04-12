import crypto from "node:crypto";
import type {ClientKind, ClientToServerMessage, GameConfig, GameServerEnvelope, SessionInfo, SessionPlayer, SessionState, StickerCollageServerEvent} from "@birthday/shared";
import type {AssetRepository} from "../infra/assetRepository.js";
import type {SessionRepository} from "../infra/sessionRepository.js";
import {StickerCollageEngine} from "../game-modes/sticker-collage/stickerCollageEngine.js";
import {GameEngineRegistry} from "../game-modes/gameModeRegistry.js";
import {SessionStateFactory} from "./sessionStateFactory.js";
import type {ConnectedClientSession, RuntimeEntry} from "./sessionRuntimeTypes.js";
import {SessionEventPublisher} from "./sessionEventPublisher.js";
import {PhaseTimerScheduler} from "./phaseTimerScheduler.js";
import {PlayerManager} from "./playerManager.js";
import {SessionMutator} from "./sessionMutator.js";

const SESSION_CODE_ALPHABET = "0123456789";

function generateSessionCode(length: number = 4): string {
    let code = "";
    for (let i = 0; i < length; i += 1) {
        code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
    }
    return code;
}

export class SessionService {
    private readonly runtimes = new Map<string, RuntimeEntry>();
    private readonly engineRegistry = new GameEngineRegistry();
    private readonly sessionStateFactory: SessionStateFactory;
    private readonly eventPublisher = new SessionEventPublisher();
    private readonly mutator: SessionMutator;
    private readonly phaseTimer: PhaseTimerScheduler;
    private readonly playerManager: PlayerManager;

    public constructor(
        private readonly config: GameConfig,
        private readonly sessionRepository: SessionRepository,
        private readonly assetRepository: AssetRepository,
    ) {
        this.engineRegistry.register(new StickerCollageEngine(config));
        this.sessionStateFactory = new SessionStateFactory(config, this.engineRegistry);
        this.mutator = new SessionMutator(sessionRepository, this.eventPublisher);
        this.phaseTimer = new PhaseTimerScheduler(this.runtimes, this.engineRegistry, this.mutator);
        this.playerManager = new PlayerManager(assetRepository, this.engineRegistry, this.sessionStateFactory, this.mutator, this.runtimes);
    }

    // ─── Event callback registration ────────────────────────────────

    public setOnSessionStateChanged(callback: (sessionId: string, state: SessionState) => void | Promise<void>): void {
        this.eventPublisher.setOnSessionStateChanged(callback);
    }

    public setOnSessionGameEvents(callback: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>): void {
        this.eventPublisher.setOnSessionGameEvents(callback);
    }

    // ─── Session CRUD ────────────────────────────────────────────────

    public async createSession(args: {baseUrl: string}): Promise<SessionInfo> {
        const sessionId = crypto.randomUUID().slice(0, 8);
        const sessionCode = await this.generateUniqueSessionCode();

        const state = this.sessionStateFactory.createEmpty({sessionId, sessionCode});

        await this.sessionRepository.create(state);
        this.runtimes.set(sessionId, {
            sessionRuntime: {connectedClients: new Map<string, ConnectedClientSession>()},
            phaseTimer: null,
        });

        return {
            sessionId,
            sessionCode,
            playerJoinUrl: `${args.baseUrl}/join/${encodeURIComponent(sessionCode)}`,
            boardUrl: `${args.baseUrl}/board/${encodeURIComponent(sessionCode)}`,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt,
        };
    }

    public async listSessions(): Promise<SessionState[]> {
        const allSessions = await this.sessionRepository.listAll();
        return allSessions
            .filter(session => session.expiresAt > Date.now())
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    public async loadState(sessionId: string): Promise<SessionState | null> {
        return this.sessionRepository.load(sessionId);
    }

    public async loadStateByCode(sessionCode: string): Promise<SessionState | null> {
        return this.sessionRepository.loadByCode(sessionCode);
    }

    public async deleteSession(sessionId: string): Promise<boolean> {
        const existing = await this.sessionRepository.load(sessionId);
        if (!existing) {
            return false;
        }

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
    }): Promise<{state: SessionState; player: SessionPlayer; gameEvents: StickerCollageServerEvent[]} | null> {
        const result = await this.playerManager.join(args);
        if (result) {
            this.phaseTimer.schedule(args.sessionId, result.state);
        }
        return result;
    }

    public async setPlayerName(sessionId: string, playerId: string, name: string): Promise<SessionState | null> {
        return this.playerManager.setPlayerName(sessionId, playerId, name);
    }

    public async saveAvatar(sessionId: string, playerId: string, avatarDataUrl: string): Promise<SessionState | null> {
        const result = await this.playerManager.saveAvatar(sessionId, playerId, avatarDataUrl);
        if (!result) {
            return null;
        }
        if (result.gameEvents.length > 0) {
            await this.eventPublisher.publishGameEvents(sessionId, result.gameEvents);
        }
        return result.state;
    }

    public removeConnectionSession(sessionId: string, clientId: string): void {
        this.playerManager.removeConnection(sessionId, clientId);
    }

    public async markPlayerDisconnected(sessionId: string, playerId: string): Promise<void> {
        return this.playerManager.markDisconnected(sessionId, playerId);
    }

    // ─── Game orchestration ──────────────────────────────────────────

    public async startGameSession(sessionId: string): Promise<SessionState | null> {
        const result = await this.mutator.mutate(sessionId, (state) => {
            const engineResult = this.engineRegistry.get().startGame({sessionState: state, now: Date.now()});
            return {
                stateChanged: engineResult.stateChanged,
                gameEvents: engineResult.emittedEvents.length > 0 ? engineResult.emittedEvents : undefined,
                extra: undefined,
            };
        });

        if (result) {
            this.phaseTimer.schedule(sessionId, result.state);
        }
        return result?.state ?? null;
    }

    public async resetSession(sessionId: string): Promise<SessionState | null> {
        const result = await this.mutator.mutate(sessionId, (state) => {
            this.phaseTimer.clear(sessionId);
            const engineResult = this.engineRegistry.get().resetGame({sessionState: state, now: Date.now()});
            return {
                stateChanged: engineResult.stateChanged,
                gameEvents: engineResult.emittedEvents.length > 0 ? engineResult.emittedEvents : undefined,
                extra: undefined,
            };
        });
        return result?.state ?? null;
    }

    public async handleGameAction(args: {
        sessionId: string;
        clientId: string;
        playerId: string;
        clientKind: ClientKind;
        message: Extract<ClientToServerMessage, {type: "game-action"}>;
    }): Promise<SessionState | null> {
        const result = await this.mutator.mutate(args.sessionId, async (state) => {
            const engineResult = await this.engineRegistry.get().applyAction({
                sessionState: state,
                action: args.message.action,
                context: {
                    sessionId: args.sessionId,
                    playerId: args.playerId,
                    clientId: args.clientId,
                    clientKind: args.clientKind,
                    now: Date.now(),
                },
            });

            return {
                stateChanged: engineResult.stateChanged,
                gameEvents: engineResult.emittedEvents.length > 0 ? engineResult.emittedEvents : undefined,
                extra: undefined,
            };
        });

        if (result) {
            this.phaseTimer.schedule(args.sessionId, result.state);
        }
        return result?.state ?? null;
    }

    private getOrCreateRuntime(sessionId: string): RuntimeEntry {
        const existing = this.runtimes.get(sessionId);
        if (existing) {
            return existing;
        }

        const created: RuntimeEntry = {
            sessionRuntime: {connectedClients: new Map<string, ConnectedClientSession>()},
            phaseTimer: null,
        };
        this.runtimes.set(sessionId, created);
        return created;
    }

    private async generateUniqueSessionCode(): Promise<string> {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const code = generateSessionCode();
            const existing = await this.sessionRepository.loadByCode(code);
            if (!existing) {
                return code;
            }
        }
        throw new Error("Could not generate unique session code");
    }

    // ─── Collage snapshot ───────────────────────────────────────────

    public async updateCollageSnapshot(
        sessionId: string,
        collageId: string,
        playerId: string,
        snapshotUrl: string,
    ): Promise<SessionState | null> {
        const result = await this.mutator.mutate(sessionId, (state) => {
            const {submissions} = state.gameState;
            if (!submissions) {
                return {stateChanged: false, extra: undefined};
            }

            for (const roundSubs of Object.values(submissions)) {
                for (const collage of roundSubs) {
                    if (collage.id === collageId && collage.playerId === playerId) {
                        collage.snapshotUrl = snapshotUrl;
                        return {stateChanged: true, extra: undefined};
                    }
                }
            }
            return {stateChanged: false, extra: undefined};
        });
        return result?.state ?? null;
    }
}
