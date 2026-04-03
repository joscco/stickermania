import crypto from "node:crypto";
import type {ClientKind, SessionPlayer, SessionState} from "@birthday/shared";
import type {AssetRepository} from "../infra/assetRepository.js";
import type {SessionRepository} from "../infra/sessionRepository.js";
import type {GameModeRegistry} from "../game-modes/gameModeRegistry.js";
import type {ConnectedClientSession, RuntimeEntry} from "./sessionRuntimeTypes.js";
import type {SessionStateFactory} from "./sessionStateFactory.js";
import type {SessionEventPublisher} from "./sessionEventPublisher.js";

/**
 * Handles player join, name changes, avatar uploads, and disconnect tracking.
 */
export class PlayerManager {
    public constructor(
        private readonly sessionRepository: SessionRepository,
        private readonly assetRepository: AssetRepository,
        private readonly gameModeRegistry: GameModeRegistry,
        private readonly sessionStateFactory: SessionStateFactory,
        private readonly eventPublisher: SessionEventPublisher,
        private readonly runtimes: Map<string, RuntimeEntry>,
    ) {}

    public async join(args: {
        sessionId: string;
        clientId: string;
        kind: ClientKind;
        existingPlayerId?: string;
    }): Promise<{state: SessionState; player: SessionPlayer; gameEvents: any[]} | null> {
        const state = await this.sessionRepository.load(args.sessionId);
        if (!state) return null;

        const runtime = this.getOrCreateRuntime(state);

        // Board clients are spectators
        if (args.kind === "board") {
            runtime.sessionRuntime.connectedClients.set(args.clientId, {
                playerId: "__board__",
                clientId: args.clientId,
                kind: args.kind,
                connectedAt: Date.now(),
            });

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
                gameEvents: [],
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

        this.eventPublisher.bumpRevision(state);
        await this.sessionRepository.save(state);
        await this.eventPublisher.publishState(state);

        // Don't publish game events here — the joining client is not yet in the
        // wsPlugin clients map, so targeted events would be lost. Instead, return
        // them so the caller (wsPlugin) can send them directly to the client.
        return {state, player, gameEvents: result.emittedEvents as any[]};
    }

    public async setPlayerName(sessionId: string, playerId: string, name: string): Promise<SessionState | null> {
        const state = await this.sessionRepository.load(sessionId);
        if (!state) return null;

        const player = state.players[playerId];
        if (!player) return null;

        player.name = name.trim().slice(0, 24);
        this.eventPublisher.bumpRevision(state);
        await this.sessionRepository.save(state);
        await this.eventPublisher.publishState(state);
        return state;
    }

    public async saveAvatar(sessionId: string, playerId: string, avatarDataUrl: string): Promise<SessionState | null> {
        const state = await this.sessionRepository.load(sessionId);
        if (!state) return null;

        const player = state.players[playerId];
        if (!player) return null;

        const savedAsset = await this.assetRepository.saveAvatar({
            sessionId,
            playerId,
            playerName: player.name || "player",
            imageDataUrl: avatarDataUrl,
        });

        player.avatarUrl = savedAsset.publicUrl;
        player.avatarAssetPath = savedAsset.assetPath;

        this.eventPublisher.bumpRevision(state);
        await this.sessionRepository.save(state);
        await this.eventPublisher.publishState(state);
        return state;
    }

    public removeConnection(sessionId: string, clientId: string): void {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) return;
        runtime.sessionRuntime.connectedClients.delete(clientId);
    }

    public async markDisconnected(sessionId: string, playerId: string): Promise<void> {
        const state = await this.sessionRepository.load(sessionId);
        if (!state) return;

        const player = state.players[playerId];
        if (!player || !player.connected) return;

        player.connected = false;
        this.eventPublisher.bumpRevision(state);
        await this.sessionRepository.save(state);
        await this.eventPublisher.publishState(state);
    }

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
}

