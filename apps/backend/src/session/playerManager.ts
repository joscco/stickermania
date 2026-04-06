import crypto from "node:crypto";
import type {ClientKind, SessionPlayer, SessionState} from "@birthday/shared";
import type {AssetRepository} from "../infra/assetRepository.js";
import type {GameModeRegistry} from "../game-modes/gameModeRegistry.js";
import type {ConnectedClientSession, RuntimeEntry} from "./sessionRuntimeTypes.js";
import type {SessionStateFactory} from "./sessionStateFactory.js";
import type {SessionMutator} from "./sessionMutator.js";

/**
 * Handles player join, name changes, avatar uploads, and disconnect tracking.
 */
export class PlayerManager {
    public constructor(
        private readonly assetRepository: AssetRepository,
        private readonly gameModeRegistry: GameModeRegistry,
        private readonly sessionStateFactory: SessionStateFactory,
        private readonly mutator: SessionMutator,
        private readonly runtimes: Map<string, RuntimeEntry>,
    ) {}

    public async join(args: {
        sessionId: string;
        clientId: string;
        kind: ClientKind;
        existingPlayerId?: string;
    }): Promise<{state: SessionState; player: SessionPlayer; gameEvents: any[]} | null> {
        const result = await this.mutator.mutate<{player: SessionPlayer; gameEvents: any[]}>(
            args.sessionId,
            (state) => {
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
                        stateChanged: false,
                        extra: {
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
                        },
                    };
                }

                // Player clients
                let player = args.existingPlayerId ? state.players[args.existingPlayerId] : undefined;

                // Check if this clientId is already registered — reuse the same player
                if (!player) {
                    const existingConnection = runtime.sessionRuntime.connectedClients.get(args.clientId);
                    if (existingConnection && existingConnection.playerId !== "__board__") {
                        player = state.players[existingConnection.playerId];
                    }
                }

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
                const engineResult = engine.onPlayerJoined({
                    sessionState: state as never,
                    player,
                    connectedClient: runtime.sessionRuntime.connectedClients.get(args.clientId)!,
                    now: Date.now(),
                });

                return {
                    stateChanged: true,
                    gameEvents: engineResult.emittedEvents.length > 0
                        ? {mode: state.activeMode, events: engineResult.emittedEvents as any[]}
                        : undefined,
                    extra: {player, gameEvents: engineResult.emittedEvents as any[]},
                };
            },
        );

        if (!result) return null;
        return {state: result.state, ...result.extra};
    }

    public async setPlayerName(sessionId: string, playerId: string, name: string): Promise<SessionState | null> {
        const result = await this.mutator.mutate(sessionId, (state) => {
            const player = state.players[playerId];
            if (!player) return {stateChanged: false, extra: undefined};

            player.name = name.trim().slice(0, 24);
            return {stateChanged: true, extra: undefined};
        });
        return result?.state ?? null;
    }

    public async saveAvatar(sessionId: string, playerId: string, avatarDataUrl: string): Promise<{state: SessionState; gameEvents: any[]} | null> {
        // Avatar saving involves an async I/O call, so we use the async callback form
        const result = await this.mutator.mutate<{gameEvents: any[]}>(sessionId, async (state) => {
            const player = state.players[playerId];
            if (!player) return {stateChanged: false, extra: {gameEvents: []}};

            const savedAsset = await this.assetRepository.saveAvatar({
                sessionId,
                playerId,
                playerName: player.name || "player",
                imageDataUrl: avatarDataUrl,
            });

            player.avatarUrl = savedAsset.publicUrl;
            player.avatarAssetPath = savedAsset.assetPath;

            // If the player now has name + avatar, notify the engine so it can
            // assign an initial task (e.g. draw-search DRAW task).
            let gameEvents: any[] = [];
            if (player.name.trim() && player.avatarUrl) {
                const runtime = this.runtimes.get(sessionId);
                const connectedClient = runtime
                    ? Array.from(runtime.sessionRuntime.connectedClients.values()).find(c => c.playerId === playerId)
                    : undefined;

                if (connectedClient) {
                    const engine = this.gameModeRegistry.get(state.activeMode);
                    const engineResult = engine.onPlayerJoined({
                        sessionState: state as never,
                        player,
                        connectedClient,
                        now: Date.now(),
                    });
                    gameEvents = engineResult.emittedEvents as any[];
                }
            }

            return {
                stateChanged: true,
                gameEvents: gameEvents.length > 0
                    ? {mode: state.activeMode, events: gameEvents}
                    : undefined,
                extra: {gameEvents},
            };
        });

        if (!result) {
            return null;
        }
        return {state: result.state, gameEvents: result.extra.gameEvents};
    }

    public removeConnection(sessionId: string, clientId: string): void {
        const runtime = this.runtimes.get(sessionId);
        if (!runtime) return;
        runtime.sessionRuntime.connectedClients.delete(clientId);
    }

    public async markDisconnected(sessionId: string, playerId: string): Promise<void> {
        await this.mutator.mutate(sessionId, (state) => {
            const player = state.players[playerId];
            if (!player || !player.connected) return {stateChanged: false, extra: undefined};

            player.connected = false;
            return {stateChanged: true, extra: undefined};
        });
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

