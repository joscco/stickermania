import {Injectable} from "@angular/core";
import type {PlayerSticker, StickerDefinition, StickerEditorUpload, StickerPack} from "@stickermania/shared";
import {
  addStickerToPlayerPack,
  createPlayerStickerPack,
  ensurePlayerDefaultStickerPack,
  removeStickerFromPlayerPacks,
  touchSessionState,
} from "@stickermania/shared/sessionState";
import {DEFAULT_GAME_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import {buildStickerCatalog, buildStickerPacks} from "@stickermania/shared/sessionState";
import {LocalSessionRuntimeService} from "./local-session-runtime.service";

@Injectable({providedIn: "root"})
export class LocalStickerRuntimeService {
  public constructor(private readonly sessions: LocalSessionRuntimeService) {}

  public async uploadStickerImage(
    sessionId: string,
    playerId: string,
    stickerId: string,
    imageDataUrl: string,
    stickerName?: string,
    packId?: string,
    overlayBounds?: StickerDefinition["overlayBounds"],
    editorData?: StickerEditorUpload,
  ): Promise<{ok: boolean; publicUrl: string; assetPath: string; sticker: PlayerSticker}> {
    const state = await this.sessions.loadPersistedSessionState(sessionId);
    const player = state.players[playerId];
    if (!player) {
      throw new Error("Player not found.");
    }

    const now = Date.now();
    const imageUrl = await this.sessions.saveDataUrlAsset(`sticker:${stickerId}:image`, imageDataUrl);
    const baseImageUrl = editorData
      ? await this.sessions.saveDataUrlAsset(`sticker:${stickerId}:base`, editorData.baseImageDataUrl)
      : null;
    const paintImageUrl = editorData
      ? await this.sessions.saveDataUrlAsset(`sticker:${stickerId}:paint`, editorData.paintImageDataUrl)
      : null;
    const sticker: PlayerSticker = {
      id: stickerId,
      name: stickerName,
      ownerPlayerId: playerId,
      imageUrl,
      assetPath: imageUrl,
      createdAt: now,
      packId,
      ...(overlayBounds ? {overlayBounds} : {}),
      ...(editorData ? {editorData: {
        version: editorData.version,
        baseImageUrl: baseImageUrl ?? "",
        paintImageUrl: paintImageUrl ?? "",
        baseImageAssetPath: baseImageUrl ?? undefined,
        paintImageAssetPath: paintImageUrl ?? undefined,
        workspace: editorData.workspace,
        outlineWidth: editorData.outlineWidth,
        ...(editorData.textBox ? {textBox: editorData.textBox} : {}),
      }} : {}),
    };

    state.gameState.playerStickers[playerId] ??= [];
    const resolvedPackId = addStickerToPlayerPack(state.gameState, sticker, player.name);
    const stickerWithPack = {...sticker, packId: resolvedPackId};
    state.gameState.playerStickers[playerId] = [
      ...state.gameState.playerStickers[playerId].filter(existing => existing.id !== stickerId),
      stickerWithPack,
    ];
    const catalogDefinition: StickerDefinition = {
      id: stickerWithPack.id,
      name: stickerWithPack.name,
      imageUrl: stickerWithPack.imageUrl,
      packId: stickerWithPack.packId,
      ownerPlayerId: playerId,
      createdAt: stickerWithPack.createdAt,
      ...(stickerWithPack.overlayBounds ? {overlayBounds: stickerWithPack.overlayBounds} : {}),
      ...(stickerWithPack.editorData ? {editorData: stickerWithPack.editorData} : {}),
    };
    state.gameState.stickerCatalog = [
      ...state.gameState.stickerCatalog.filter(sticker => sticker.id !== stickerId),
      catalogDefinition,
    ];
    touchSessionState(state, now);
    await this.sessions.savePersistedSessionState(state);
    const hydratedSticker = await this.sessions.hydratePlayerSticker(stickerWithPack);

    return {
      ok: true,
      publicUrl: hydratedSticker.imageUrl,
      assetPath: stickerWithPack.assetPath,
      sticker: hydratedSticker,
    };
  }

  public async createPlayerStickerPack(sessionId: string, playerId: string, name: string): Promise<{ok: boolean; pack: StickerPack}> {
    const state = await this.sessions.loadPersistedSessionState(sessionId);
    const player = state.players[playerId];
    if (!player) {
      throw new Error("Player not found.");
    }
    ensurePlayerDefaultStickerPack(state.gameState, playerId, player.name);
    const now = Date.now();
    const pack = createPlayerStickerPack({gameState: state.gameState, playerId, name, now});
    touchSessionState(state, now);
    await this.sessions.savePersistedSessionState(state);
    return {ok: true, pack};
  }

  public async deletePlayerStickerPack(sessionId: string, playerId: string, packId: string): Promise<{ok: boolean; packs: StickerPack[]}> {
    const state = await this.sessions.loadPersistedSessionState(sessionId);
    const player = state.players[playerId];
    if (!player) {
      throw new Error("Player not found.");
    }
    const defaultPack = ensurePlayerDefaultStickerPack(state.gameState, playerId, player.name);
    if (packId !== defaultPack.id) {
      const pack = state.gameState.stickerPacks.find(item => item.id === packId);
      if (pack?.ownerPlayerId === playerId) {
        const movedStickerIds = new Set(pack.stickerIds ?? []);
        for (const sticker of state.gameState.playerStickers[playerId] ?? []) {
          if (sticker.packId === packId || movedStickerIds.has(sticker.id)) {
            sticker.packId = defaultPack.id;
            defaultPack.stickerIds = [...defaultPack.stickerIds.filter(id => id !== sticker.id), sticker.id];
          }
        }
        for (const definition of state.gameState.stickerCatalog) {
          if (movedStickerIds.has(definition.id) || definition.packId === packId) {
            definition.packId = defaultPack.id;
          }
        }
        state.gameState.stickerPacks = state.gameState.stickerPacks
          .filter(item => item.id !== packId)
          .map(item => item.id === defaultPack.id
            ? {...item, stickerIds: [...defaultPack.stickerIds]}
            : {...item, stickerIds: (item.stickerIds ?? []).filter(id => !movedStickerIds.has(id))}
          );
      }
    }
    touchSessionState(state);
    await this.sessions.savePersistedSessionState(state);
    return {ok: true, packs: state.gameState.stickerPacks};
  }

  public async moveStickerToPack(sessionId: string, playerId: string, stickerId: string, packId: string): Promise<{ok: boolean; sticker: PlayerSticker}> {
    const state = await this.sessions.loadPersistedSessionState(sessionId);
    const player = state.players[playerId];
    const sticker = state.gameState.playerStickers[playerId]?.find(item => item.id === stickerId);
    if (!player || !sticker) {
      throw new Error("Sticker not found.");
    }
    sticker.packId = packId;
    sticker.packId = addStickerToPlayerPack(state.gameState, sticker, player.name);
    const catalogSticker = state.gameState.stickerCatalog.find(definition => definition.id === stickerId);
    if (catalogSticker) {
      catalogSticker.packId = sticker.packId;
    }
    touchSessionState(state);
    await this.sessions.savePersistedSessionState(state);
    return {ok: true, sticker: await this.sessions.hydratePlayerSticker(sticker)};
  }

  public async deleteStickerImage(sessionId: string, playerId: string, stickerId: string): Promise<{
    ok: boolean;
    stickerId: string;
    removedBoardPlacementCount: number;
  }> {
    const state = await this.sessions.loadPersistedSessionState(sessionId);
    const playerStickers = state.gameState.playerStickers[playerId] ?? [];
    const existingSticker = playerStickers.find(sticker => sticker.id === stickerId);
    if (!state.players[playerId] || !existingSticker) {
      throw new Error("Sticker not found.");
    }
    const catalogSticker = state.gameState.stickerCatalog.find(sticker => sticker.id === stickerId);
    state.gameState.playerStickers[playerId] = playerStickers.filter(sticker => sticker.id !== stickerId);
    const previousPlacementCount = state.gameState.boardPlacements.length;
    state.gameState.boardPlacements = state.gameState.boardPlacements.filter(placement => placement.stickerId !== stickerId);
    state.gameState.stickerCatalog = state.gameState.stickerCatalog.filter(sticker => sticker.id !== stickerId);
    removeStickerFromPlayerPacks(state.gameState, stickerId);
    touchSessionState(state);
    await this.sessions.savePersistedSessionState(state);
    await this.deleteStickerAssets(existingSticker);
    if (catalogSticker) {
      await this.deleteStickerAssets(catalogSticker);
    }
    return {ok: true, stickerId, removedBoardPlacementCount: previousPlacementCount - state.gameState.boardPlacements.length};
  }

  public getStickerCatalog(): Promise<StickerDefinition[]> {
    return Promise.resolve(buildStickerCatalog(DEFAULT_GAME_CONFIG.stickerCollage.catalog));
  }

  public getStickerPacks(): Promise<StickerPack[]> {
    return Promise.resolve(buildStickerPacks(DEFAULT_GAME_CONFIG.stickerCollage.catalog));
  }

  private async deleteStickerAssets(sticker: PlayerSticker | StickerDefinition): Promise<void> {
    await this.sessions.deleteAssetRef(sticker.imageUrl);
    if (sticker.editorData) {
      await this.sessions.deleteAssetRef(sticker.editorData.baseImageUrl);
      await this.sessions.deleteAssetRef(sticker.editorData.paintImageUrl);
    }
  }
}
