import {Injectable} from "@angular/core";
import type {PlayerSticker, StickerDefinition, StickerEditorUpload, StickerPack} from "@birthday/shared";
import {StickerApiService} from "../api/sticker-api.service";
import {AppRuntimeService} from "./app-runtime.service";
import {LocalStickerRuntimeService} from "./local/local-sticker-runtime.service";

@Injectable({providedIn: "root"})
export class StickerRuntimeService {
  public constructor(
    private readonly appRuntime: AppRuntimeService,
    private readonly remoteApi: StickerApiService,
    private readonly localRuntime: LocalStickerRuntimeService,
  ) {}

  public uploadStickerImage(
    sessionId: string,
    playerId: string,
    stickerId: string,
    imageDataUrl: string,
    stickerName?: string,
    packId?: string,
    overlayBounds?: StickerDefinition["overlayBounds"],
    editorData?: StickerEditorUpload,
  ): Promise<{ok: boolean; publicUrl: string; assetPath: string; sticker: PlayerSticker}> {
    return this.delegate().uploadStickerImage(sessionId, playerId, stickerId, imageDataUrl, stickerName, packId, overlayBounds, editorData);
  }

  public createPlayerStickerPack(sessionId: string, playerId: string, name: string): Promise<{ok: boolean; pack: StickerPack}> {
    return this.delegate().createPlayerStickerPack(sessionId, playerId, name);
  }

  public deletePlayerStickerPack(sessionId: string, playerId: string, packId: string): Promise<{ok: boolean; packs: StickerPack[]}> {
    return this.delegate().deletePlayerStickerPack(sessionId, playerId, packId);
  }

  public moveStickerToPack(sessionId: string, playerId: string, stickerId: string, packId: string): Promise<{ok: boolean; sticker: PlayerSticker}> {
    return this.delegate().moveStickerToPack(sessionId, playerId, stickerId, packId);
  }

  public deleteStickerImage(sessionId: string, playerId: string, stickerId: string): Promise<{
    ok: boolean;
    stickerId: string;
    removedBoardPlacementCount: number;
  }> {
    return this.delegate().deleteStickerImage(sessionId, playerId, stickerId);
  }

  public getStickerCatalog(): Promise<StickerDefinition[]> {
    return this.delegate().getStickerCatalog();
  }

  public getStickerPacks(): Promise<StickerPack[]> {
    return this.delegate().getStickerPacks();
  }

  private delegate(): StickerApiService | LocalStickerRuntimeService {
    return this.appRuntime.usesLocalBrowserGame() ? this.localRuntime : this.remoteApi;
  }
}
