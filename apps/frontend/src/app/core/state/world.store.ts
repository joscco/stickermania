import {computed, Injectable, signal} from "@angular/core";
import type {BoardStickerPlacement, PlayerSticker, SessionPlayer, SessionState, StickerCollageGameState, StickerPack} from "@birthday/shared";

@Injectable({ providedIn: "root" })
export class WorldStore {

  public readonly sessionState = signal<SessionState | null>(null);
  public readonly lastError = signal<string | null>(null);
  public readonly players = computed<Record<string, SessionPlayer>>(() => this.sessionState()?.players ?? {});

  public readonly stickerCollageGameState = computed<StickerCollageGameState | null>(() => {
    const sessionState = this.sessionState();

    if (!sessionState) {
      return null;
    }

    return sessionState.gameState;
  });

  public setSessionState(state: SessionState): void {
    this.sessionState.set(state);
    this.lastError.set(null);
  }

  public clearSessionState(): void {
    this.sessionState.set(null);
  }


  public updatePlayerLocal(playerId: string, update: {name?: string; avatarUrl?: string | null}): void {
    const state = this.sessionState();
    if (!state) return;

    const currentPlayer = state.players[playerId];
    if (!currentPlayer) return;

    this.sessionState.set({
      ...state,
      players: {
        ...state.players,
        [playerId]: {
          ...currentPlayer,
          ...(update.name !== undefined ? {name: update.name} : {}),
          ...(update.avatarUrl !== undefined ? {avatarUrl: update.avatarUrl} : {}),
        },
      },
    });
  }

  public addCreatedStickerLocal(sticker: PlayerSticker): void {
    const state = this.sessionState();
    if (!state) return;

    const playerStickers = state.gameState.playerStickers[sticker.ownerPlayerId] ?? [];
    const existingCatalogIndex = state.gameState.stickerCatalog.findIndex(definition => definition.id === sticker.id);
    const packId = sticker.packId ?? `player-${sticker.ownerPlayerId}`;
    const nextDefinition = {
      id: sticker.id,
      name: sticker.name,
      imageUrl: sticker.imageUrl,
      packId,
      ownerPlayerId: sticker.ownerPlayerId,
      createdAt: sticker.createdAt,
      ...(sticker.overlayBounds ? {overlayBounds: sticker.overlayBounds} : {}),
    };
    const stickerPacks = this.withStickerInPack(state.gameState.stickerPacks, packId, sticker.id, sticker.ownerPlayerId);

    this.sessionState.set({
      ...state,
      gameState: {
        ...state.gameState,
        playerStickers: {
          ...state.gameState.playerStickers,
          [sticker.ownerPlayerId]: [
            ...playerStickers.filter(item => item.id !== sticker.id),
            sticker,
          ],
        },
        stickerCatalog: existingCatalogIndex >= 0
          ? state.gameState.stickerCatalog.map(definition => definition.id === sticker.id ? nextDefinition : definition)
          : [...state.gameState.stickerCatalog, nextDefinition],
        stickerPacks,
      },
    });
  }

  public deleteStickerLocal(stickerId: string): void {
    const state = this.sessionState();
    if (!state) return;

    const nextPlayerStickers = Object.fromEntries(Object.entries(state.gameState.playerStickers).map(([playerId, stickers]) => [
      playerId,
      stickers.filter(sticker => sticker.id !== stickerId),
    ]));

    this.sessionState.set({
      ...state,
      gameState: {
        ...state.gameState,
        playerStickers: nextPlayerStickers,
        stickerCatalog: state.gameState.stickerCatalog.filter(definition => definition.id !== stickerId),
        stickerPacks: state.gameState.stickerPacks.map(pack => ({
          ...pack,
          stickerIds: pack.stickerIds.filter(id => id !== stickerId),
        })),
        boardPlacements: state.gameState.boardPlacements.filter(placement => placement.stickerId !== stickerId),
      },
    });
  }

  public upsertBoardPlacementsLocal(placements: BoardStickerPlacement[]): void {
    const state = this.sessionState();
    if (!state || placements.length === 0) return;

    const nextPlacements = new Map(state.gameState.boardPlacements.map(placement => [placement.instanceId, placement]));
    for (const placement of placements) {
      nextPlacements.set(placement.instanceId, placement);
    }

    this.sessionState.set({
      ...state,
      gameState: {
        ...state.gameState,
        boardPlacements: [...nextPlacements.values()],
      },
    });
  }

  public addStickerPackLocal(pack: StickerPack): void {
    const state = this.sessionState();
    if (!state) return;

    this.sessionState.set({
      ...state,
      gameState: {
        ...state.gameState,
        stickerPacks: [
          ...state.gameState.stickerPacks.filter(existingPack => existingPack.id !== pack.id),
          pack,
        ],
      },
    });
  }

  public moveStickerToPackLocal(sticker: PlayerSticker): void {
    const state = this.sessionState();
    if (!state) return;

    const packId = sticker.packId ?? `player-${sticker.ownerPlayerId}`;
    const playerStickers = state.gameState.playerStickers[sticker.ownerPlayerId] ?? [];
    const stickerPacks = this.withStickerInPack(state.gameState.stickerPacks, packId, sticker.id, sticker.ownerPlayerId);

    this.sessionState.set({
      ...state,
      gameState: {
        ...state.gameState,
        playerStickers: {
          ...state.gameState.playerStickers,
          [sticker.ownerPlayerId]: playerStickers.map(item => item.id === sticker.id ? sticker : item),
        },
        stickerCatalog: state.gameState.stickerCatalog.map(definition =>
          definition.id === sticker.id ? {...definition, packId} : definition
        ),
        stickerPacks,
      },
    });
  }

  public setStickerPacksLocal(packs: StickerPack[]): void {
    const state = this.sessionState();
    if (!state) return;

    const packIds = new Set(packs.map(pack => pack.id));
    const fallbackPackByOwner = new Map<string, string>();
    for (const pack of packs) {
      if (pack.ownerPlayerId && pack.id === `player-${pack.ownerPlayerId}`) {
        fallbackPackByOwner.set(pack.ownerPlayerId, pack.id);
      }
    }

    this.sessionState.set({
      ...state,
      gameState: {
        ...state.gameState,
        stickerPacks: packs,
        playerStickers: Object.fromEntries(Object.entries(state.gameState.playerStickers).map(([playerId, stickers]) => [
          playerId,
          stickers.map(sticker => {
            const fallbackPackId = fallbackPackByOwner.get(sticker.ownerPlayerId);
            return sticker.packId && packIds.has(sticker.packId)
              ? sticker
              : {...sticker, packId: fallbackPackId ?? sticker.packId};
          }),
        ])),
        stickerCatalog: state.gameState.stickerCatalog.map(definition =>
          definition.packId && packIds.has(definition.packId)
            ? definition
            : {...definition, packId: definition.ownerPlayerId ? fallbackPackByOwner.get(definition.ownerPlayerId) ?? definition.packId : definition.packId}
        ),
      },
    });
  }

  private withStickerInPack(stickerPacks: StickerPack[], packId: string, stickerId: string, ownerPlayerId: string): StickerPack[] {
    const packsWithoutSticker = stickerPacks.map(pack => ({
      ...pack,
      stickerIds: pack.stickerIds.filter(id => id !== stickerId),
    }));
    const existing = packsWithoutSticker.find(pack => pack.id === packId);
    if (!existing) {
      return [
        ...packsWithoutSticker,
        {id: packId, name: "Meine Sticker", ownerPlayerId, stickerIds: [stickerId]},
      ];
    }
    return packsWithoutSticker.map(pack =>
      pack.id === packId
        ? {...pack, stickerIds: [...pack.stickerIds, stickerId]}
        : pack
    );
  }

}
