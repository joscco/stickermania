import {normalizeBoardZIndexes, type BoardStickerPlacement, type ClientKind, type GameConfig, type SessionPlayer, type SessionState, type StickerCollageClientAction, type StickerCollageGameState, type StickerCollageServerEvent} from "@birthday/shared";
import type {ConnectedClientSession} from "../session-management/sessionRuntimeTypes.js";
import {buildCatalog, buildPacks} from "./catalog/stickerCatalog.js";
import {ensurePlayerDefaultStickerPack} from "./playerStickerPacks.js";

export interface StickerCollageGameResult {
    stateChanged: boolean;
    emittedEvents: StickerCollageServerEvent[];
}

function ensureBoardState(gameState: StickerCollageGameState, config: GameConfig): void {
    gameState.playerStickers ??= {};
    gameState.boardPlacements ??= [];
    gameState.boardPlacements = normalizeBoardZIndexes(gameState.boardPlacements);
    gameState.stickerPacks ??= buildPacks(config.stickerCollage.catalog);
}

export class StickerCollageGame {
    public constructor(private readonly config: GameConfig) {
    }

    public createInitialState(): StickerCollageGameState {
        return {
            stickerCatalog: buildCatalog(this.config.stickerCollage.catalog),
            stickerPacks: buildPacks(this.config.stickerCollage.catalog),
            playerStickers: {},
            boardPlacements: [],
        };
    }

    public onPlayerJoined(args: {
        sessionState: SessionState;
        player: SessionPlayer;
        connectedClient: ConnectedClientSession;
        now: number;
    }): StickerCollageGameResult {
        void args.connectedClient;
        void args.now;
        ensureBoardState(args.sessionState.gameState, this.config);
        args.sessionState.gameState.playerStickers[args.player.id] ??= [];
        ensurePlayerDefaultStickerPack(args.sessionState.gameState, args.player.id, args.player.name);
        return {stateChanged: true, emittedEvents: []};
    }

    public startGame(args: { sessionState: SessionState; now: number }): StickerCollageGameResult {
        void args.now;
        ensureBoardState(args.sessionState.gameState, this.config);
        return {stateChanged: true, emittedEvents: []};
    }

    public resetGame(args: { sessionState: SessionState; now: number }): StickerCollageGameResult {
        void args.now;
        args.sessionState.gameState = this.createInitialState();
        return {stateChanged: true, emittedEvents: []};
    }

    public applyAction(args: {
        sessionState: SessionState;
        action: StickerCollageClientAction;
        context: { sessionId: string; playerId: string; clientId: string; clientKind: ClientKind; now: number };
    }): StickerCollageGameResult {
        const {gameState} = args.sessionState;
        const {action, context} = args;
        void context.sessionId;
        void context.clientId;
        ensureBoardState(gameState, this.config);

        switch (action.type) {
            case "upsert-board-placements": {
                return this.handleUpsertPlacements(gameState, action, context);
            }
            case "delete-board-placements": {
                return this.handleDeletePlacements(gameState, action, context);
            }
        }
    }

    private handleDeletePlacements(
        gameState: StickerCollageGameState,
        action: {
            instanceIds: string[];
            type: "delete-board-placements"
        },
        context: {
            clientId: string;
            clientKind: "player" | "board";
            now: number;
            playerId: string;
            sessionId: string
        })
        : StickerCollageGameResult {
        const deleteIds = new Set(action.instanceIds);
        if (deleteIds.size === 0) {
            return {stateChanged: false, emittedEvents: []};
        }

        const nextPlacements = gameState.boardPlacements.filter(placement => {
            if (!deleteIds.has(placement.instanceId)) {
                return true;
            }
            return context.clientKind !== "board" && (placement.placedByPlayerId ?? placement.ownerPlayerId) !== context.playerId;
        });
        if (nextPlacements.length === gameState.boardPlacements.length) {
            return {stateChanged: false, emittedEvents: []};
        }
        gameState.boardPlacements = normalizeBoardZIndexes(nextPlacements);
        return {
            stateChanged: true,
            emittedEvents: [{type: "board-updated", playerId: context.playerId}],
        };
    }

    private handleUpsertPlacements(
        gameState: StickerCollageGameState,
        action: {
            type: "upsert-board-placements";
            placements: BoardStickerPlacement[]
        },
        context: {
            sessionId: string;
            playerId: string;
            clientId: string;
            clientKind: ClientKind;
            now: number
        })
        : StickerCollageGameResult {
        const knownStickerIds = new Set(gameState.stickerCatalog.map(sticker => sticker.id));
        const incomingPlacements = action.placements
            .filter(placement => knownStickerIds.has(placement.stickerId))
            .filter(placement => context.clientKind === "board" || (placement.placedByPlayerId ?? placement.ownerPlayerId) === context.playerId)
            .map(placement => ({
                ...placement,
                ownerPlayerId: placement.ownerPlayerId ?? placement.placedByPlayerId ?? context.playerId,
                placedByPlayerId: placement.placedByPlayerId ?? placement.ownerPlayerId ?? context.playerId,
                updatedAt: context.now,
                groupId: undefined,
            }));
        if (incomingPlacements.length === 0) {
            return {stateChanged: false, emittedEvents: []};
        }

        const merged = new Map(gameState.boardPlacements.map(placement => [placement.instanceId, placement]));
        for (const placement of incomingPlacements) {
            const existing = merged.get(placement.instanceId);
            const placedByPlayerId = existing?.placedByPlayerId ?? existing?.ownerPlayerId;
            if (
                context.clientKind !== "board"
                && existing
                && placedByPlayerId !== context.playerId
            ) {
                // Players may reorder their own sticker relative to other stickers.
                // Preserve foreign placement data, but accept the z-index rank update.
                merged.set(placement.instanceId, {...existing, zIndex: placement.zIndex});
                continue;
            }
            if (context.clientKind !== "board" && !existing && placement.placedByPlayerId !== context.playerId) {
                continue;
            }
            merged.set(placement.instanceId, placement);
        }
        gameState.boardPlacements = normalizeBoardZIndexes([...merged.values()]);
        return {
            stateChanged: true,
            emittedEvents: [{type: "board-updated", playerId: context.playerId}],
        };
    }
}
