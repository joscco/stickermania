import crypto from "node:crypto";
import type {ClientKind, SessionPlayer, SessionState, StickerCollageServerEvent} from "@stickermania/shared";
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import type {AssetRepository} from "../../infrastructure/assetRepository.js";
import type {ConnectedClientSession, RuntimeEntry} from "../session-management/sessionRuntimeTypes.js";
import type {SessionStateFactory} from "../session-management/sessionStateFactory.js";
import type {SessionMutator} from "../session-management/sessionMutator.js";
import {ensurePlayerDefaultStickerPack} from "../sticker-management/playerStickerPacks.js";
import type {StickerCollageGame} from "../sticker-management/stickerCollageGame.js";

/**
 * Handles player join, name changes, avatar uploads, and disconnect tracking.
 */
export class PlayerManager {
    public constructor(
        private readonly assetRepository: AssetRepository,
        private readonly stickerCollageGame: StickerCollageGame,
        private readonly sessionStateFactory: SessionStateFactory,
        private readonly mutator: SessionMutator,
        private readonly runtimes: Map<string, RuntimeEntry>,
    ) {}

    public async join(args: {
        sessionId: string;
        clientId: string;
        kind: ClientKind;
        existingPlayerId?: string;
    }): Promise<{state: SessionState; player: SessionPlayer; gameEvents: StickerCollageServerEvent[]} | null> {
        const result = await this.mutator.mutate<{player: SessionPlayer; gameEvents: StickerCollageServerEvent[]}>(
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

                const engineResult = this.stickerCollageGame.onPlayerJoined({
                    sessionState: state,
                    player,
                    connectedClient: runtime.sessionRuntime.connectedClients.get(args.clientId)!,
                    now: Date.now(),
                });

                return {
                    stateChanged: true,
                    gameEvents: engineResult.emittedEvents.length > 0 ? engineResult.emittedEvents : undefined,
                    extra: {player, gameEvents: engineResult.emittedEvents},
                };
            },
        );

        if (!result) return null;
        return {state: result.state, ...result.extra};
    }

    public async saveUserData(
        sessionId: string,
        playerId: string,
        name: string,
        avatarDataUrl?: string | null,
    ): Promise<{state: SessionState; gameEvents: StickerCollageServerEvent[]} | null> {
        const result = await this.mutator.mutate<{gameEvents: StickerCollageServerEvent[]}>(sessionId, async (state) => {
            const player = state.players[playerId];
            const safeName = name.trim().slice(0, STICKERMANIA_CONFIG.player.maxNameLength);
            if (!player) {
                return {stateChanged: false, extra: {gameEvents: []}};
            }

            player.name = safeName;
            ensurePlayerDefaultStickerPack(state.gameState, playerId, player.name);

            if (avatarDataUrl === null) {
                player.avatarUrl = null;
                player.avatarAssetPath = null;
            } else if (avatarDataUrl?.trim()) {
                const savedAsset = await this.assetRepository.saveAvatar({
                    sessionId,
                    playerId,
                    playerName: player.name || "player",
                    imageDataUrl: avatarDataUrl,
                });

                player.avatarUrl = `${savedAsset.publicUrl}?v=${Date.now()}`;
                player.avatarAssetPath = savedAsset.assetPath;
            }

            let gameEvents: StickerCollageServerEvent[] = [];
            if (player.name.trim() && player.avatarUrl) {
                const runtime = this.runtimes.get(sessionId);
                const connectedClient = runtime
                    ? Array.from(runtime.sessionRuntime.connectedClients.values()).find(c => c.playerId === playerId)
                    : undefined;

                if (connectedClient) {
                    const engineResult = this.stickerCollageGame.onPlayerJoined({sessionState: state, player, connectedClient, now: Date.now()});
                    gameEvents = engineResult.emittedEvents;
                }
            }

            return {
                stateChanged: true,
                gameEvents: gameEvents.length > 0 ? gameEvents : undefined,
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
                connectedClients: new Map<string, ConnectedClientSession>(),
            },
        };

        this.runtimes.set(state.sessionId, created);
        return created;
    }
}
