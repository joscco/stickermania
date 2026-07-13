import crypto from "node:crypto";
import type {ClientKind, ClientToServerMessage, GameConfig, GameServerEnvelope, PlayerSticker, SessionInfo, SessionPlayer, SessionState, StickerCollageServerEvent, StickerPack} from "@birthday/shared";
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
import type {AssetRepository} from "../../infrastructure/assetRepository.js";
import type {SessionRepository} from "../../infrastructure/sessionRepository.js";
import {SessionStateFactory} from "./sessionStateFactory.js";
import type {ConnectedClientSession, RuntimeEntry} from "./sessionRuntimeTypes.js";
import {SessionEventPublisher} from "./sessionEventPublisher.js";
import {PlayerManager} from "../player-actions/playerManager.js";
import {SessionMutator} from "./sessionMutator.js";
import {reconcilePlayerStickerPacks} from "../sticker-management/playerStickerPacks.js";
import {PlayerStickerManager} from "../sticker-management/playerStickerManager.js";
import {StickerCollageGame} from "../sticker-management/stickerCollageGame.js";

const SESSION_CODE_ALPHABET = "0123456789";
const HOST_SESSION_ID = "host-game";
const HOST_SESSION_CODE = "HOST";

function generateSessionCode(length: number = STICKERMANIA_CONFIG.session.codeLength): string {
    let code = "";
    for (let i = 0; i < length; i += 1) {
        code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
    }
    return code;
}

export class SessionService {
    private readonly runtimes = new Map<string, RuntimeEntry>();
    private readonly stickerCollageGame: StickerCollageGame;
    private readonly sessionStateFactory: SessionStateFactory;
    private readonly eventPublisher = new SessionEventPublisher();
    private readonly mutator: SessionMutator;
    private readonly playerManager: PlayerManager;
    private readonly playerStickerManager: PlayerStickerManager;

    public constructor(
        private readonly config: GameConfig,
        private readonly sessionRepository: SessionRepository,
        private readonly assetRepository: AssetRepository,
    ) {
        this.stickerCollageGame = new StickerCollageGame(config);
        this.sessionStateFactory = new SessionStateFactory(config, this.stickerCollageGame);
        this.mutator = new SessionMutator(sessionRepository, this.eventPublisher);
        this.playerManager = new PlayerManager(assetRepository, this.stickerCollageGame, this.sessionStateFactory, this.mutator, this.runtimes);
        this.playerStickerManager = new PlayerStickerManager(this.mutator);
    }

    // ─── Event callback registration ────────────────────────────────

    public setOnSessionStateChanged(callback: (sessionId: string, state: SessionState) => void | Promise<void>): void {
        this.eventPublisher.setOnSessionStateChanged(callback);
    }

    public setOnSessionGameEvents(callback: (sessionId: string, events: GameServerEnvelope[]) => void | Promise<void>): void {
        this.eventPublisher.setOnSessionGameEvents(callback);
    }

    // ─── Session CRUD ────────────────────────────────────────────────

    public async createSession(args: { baseUrl: string }): Promise<SessionInfo> {
        const sessionId = crypto.randomUUID().slice(0, 8);
        const sessionCode = await this.generateUniqueSessionCode();

        const state = this.sessionStateFactory.createEmptySession({sessionId, sessionCode});

        await this.sessionRepository.create(state);
        this.runtimes.set(sessionId, {
            sessionRuntime: {connectedClients: new Map<string, ConnectedClientSession>()},
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

    public async getOrCreateHostSession(args: { baseUrl: string }): Promise<SessionInfo> {
        const existing = await this.sessionRepository.load(HOST_SESSION_ID);
        if (existing) {
            const normalized = await this.normalizeLoadedState(existing);
            if (normalized) {
                return this.toSessionInfo(normalized, args.baseUrl);
            }
            await this.sessionRepository.delete(HOST_SESSION_ID);
        }

        const state = this.sessionStateFactory.createEmptySession({
            sessionId: HOST_SESSION_ID,
            sessionCode: HOST_SESSION_CODE,
        });

        await this.sessionRepository.create(state);
        this.runtimes.set(HOST_SESSION_ID, {
            sessionRuntime: {connectedClients: new Map<string, ConnectedClientSession>()},
        });
        return this.toSessionInfo(state, args.baseUrl);
    }

    public async listSessions(): Promise<SessionState[]> {
        const allSessions = await this.sessionRepository.listAll();
        const now = Date.now();
        const activeSessions = allSessions.filter(session => this.isSessionRetained(session, now));
        await Promise.all(activeSessions.map(session => this.normalizeStoredExpiry(session, now)));
        return activeSessions
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    public async loadState(sessionId: string): Promise<SessionState | null> {
        const state = await this.sessionRepository.load(sessionId);
        return this.normalizeLoadedState(state);
    }

    public async loadStateByCode(sessionCode: string): Promise<SessionState | null> {
        const state = await this.sessionRepository.loadByCode(sessionCode);
        return this.normalizeLoadedState(state);
    }

    public async deleteSession(sessionId: string): Promise<boolean> {
        const existing = await this.sessionRepository.load(sessionId);
        if (!existing) {
            return false;
        }

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
    }): Promise<{ state: SessionState; player: SessionPlayer; gameEvents: StickerCollageServerEvent[] } | null> {
        return this.playerManager.join(args);
    }

    public async saveUserData(
        sessionId: string,
        playerId: string,
        name: string,
        avatarDataUrl?: string | null,
    ): Promise<SessionState | null> {
        const result = await this.playerManager.saveUserData(sessionId, playerId, name, avatarDataUrl);
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
            const engineResult = this.stickerCollageGame.startGame({sessionState: state, now: Date.now()});
            return {
                stateChanged: engineResult.stateChanged,
                gameEvents: engineResult.emittedEvents.length > 0 ? engineResult.emittedEvents : undefined,
                extra: undefined,
            };
        });

        return result?.state ?? null;
    }

    public async resetSession(sessionId: string): Promise<SessionState | null> {
        const result = await this.mutator.mutate(sessionId, (state) => {
            const engineResult = this.stickerCollageGame.resetGame({sessionState: state, now: Date.now()});
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
        message: Extract<ClientToServerMessage, { type: "game-action" }>;
    }): Promise<SessionState | null> {
        const result = await this.mutator.mutate(args.sessionId, async (state) => {
            const engineResult = this.stickerCollageGame.applyAction({
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

        return result?.state ?? null;
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

    private sessionRetentionMs(): number {
        return this.config.sessionTtlHours * 60 * 60 * 1000;
    }

    private retainedUntil(state: SessionState): number {
        return state.createdAt + this.sessionRetentionMs();
    }

    private isSessionRetained(state: SessionState, now: number): boolean {
        return Math.max(state.expiresAt, this.retainedUntil(state)) > now;
    }

    private async normalizeLoadedState(state: SessionState | null): Promise<SessionState | null> {
        if (!state) {
            return null;
        }

        const now = Date.now();
        if (!this.isSessionRetained(state, now)) {
            return null;
        }

        await this.normalizeStoredExpiry(state, now);
        if (reconcilePlayerStickerPacks(state.gameState, state.players)) {
            await this.sessionRepository.save(state);
        }
        return state;
    }

    private async normalizeStoredExpiry(state: SessionState, now: number): Promise<void> {
        const retainedUntil = this.retainedUntil(state);
        if (state.expiresAt >= retainedUntil || retainedUntil <= now) {
            return;
        }

        state.expiresAt = retainedUntil;
        await this.sessionRepository.save(state);
    }

    private toSessionInfo(state: SessionState, baseUrl: string): SessionInfo {
        return {
            sessionId: state.sessionId,
            sessionCode: state.sessionCode,
            playerJoinUrl: `${baseUrl}/?view=player`,
            boardUrl: `${baseUrl}/?view=board`,
            createdAt: state.createdAt,
            expiresAt: state.expiresAt,
        };
    }

    public async addCreatedSticker(
        sessionId: string,
        playerId: string,
        sticker: PlayerSticker,
    ): Promise<SessionState | null> {
        return this.playerStickerManager.addCreatedSticker(sessionId, playerId, sticker);
    }

    public async deleteSticker(
        sessionId: string,
        playerId: string,
        stickerId: string
    ): Promise<{sticker: PlayerSticker; removedBoardPlacementCount: number} | null> {
        return this.playerStickerManager.deleteSticker(sessionId, playerId, stickerId);
    }

    public async moveStickerToPack(
        sessionId: string,
        playerId: string,
        stickerId: string,
        packId: string | undefined,
    ): Promise<PlayerSticker | null> {
        return this.playerStickerManager.moveStickerToPack(sessionId, playerId, stickerId, packId);
    }

    public async createPlayerStickerPack(
        sessionId: string,
        playerId: string,
        name: string,
    ): Promise<StickerPack | null> {
        return this.playerStickerManager.createPlayerStickerPack(sessionId, playerId, name);
    }

    public async deletePlayerStickerPack(
        sessionId: string,
        playerId: string,
        packId: string,
    ): Promise<StickerPack[] | null> {
        return this.playerStickerManager.deletePlayerStickerPack(sessionId, playerId, packId);
    }
}
