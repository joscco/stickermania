import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import type {PlayerSticker, StickerDefinition, StickerEditorUpload, StickerPack} from "@birthday/shared";
import {firstValueFrom} from "rxjs";


@Injectable({providedIn: "root"})
export class StickerApiService {
  public constructor(private readonly httpClient: HttpClient) {
  }

  public uploadStickerImage(
    sessionId: string,
    playerId: string,
    stickerId: string,
    imageDataUrl: string,
    stickerName?: string,
    packId?: string,
    overlayBounds?: StickerDefinition["overlayBounds"],
    editorData?: StickerEditorUpload,
  ): Promise<{
    ok: boolean;
    publicUrl: string;
    assetPath: string;
    sticker: PlayerSticker
  }> {
    return firstValueFrom(
      this.httpClient.post<{ ok: boolean; publicUrl: string; assetPath: string; sticker: PlayerSticker }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/sticker-image`,
        {playerId, stickerId, imageDataUrl, stickerName, packId, overlayBounds, editorData},
      ),
    );
  }

  public createPlayerStickerPack(sessionId: string, playerId: string, name: string): Promise<{
    ok: boolean;
    pack: StickerPack
  }> {
    return firstValueFrom(
      this.httpClient.post<{ ok: boolean; pack: StickerPack }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/sticker-packs`,
        {playerId, name},
      ),
    );
  }

  public deletePlayerStickerPack(sessionId: string, playerId: string, packId: string): Promise<{
    ok: boolean;
    packs: StickerPack[]
  }> {
    return firstValueFrom(
      this.httpClient.delete<{ ok: boolean; packs: StickerPack[] }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/sticker-packs/${encodeURIComponent(packId)}`,
        {body: {playerId}},
      ),
    );
  }

  public moveStickerToPack(sessionId: string, playerId: string, stickerId: string, packId: string): Promise<{
    ok: boolean;
    sticker: PlayerSticker
  }> {
    return firstValueFrom(
      this.httpClient.patch<{ ok: boolean; sticker: PlayerSticker }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/sticker-image/${encodeURIComponent(stickerId)}/pack`,
        {playerId, packId},
      ),
    );
  }

  public deleteStickerImage(sessionId: string, playerId: string, stickerId: string): Promise<{
    ok: boolean;
    stickerId: string;
    removedBoardPlacementCount: number
  }> {
    return firstValueFrom(
      this.httpClient.delete<{ ok: boolean; stickerId: string; removedBoardPlacementCount: number }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/sticker-image/${encodeURIComponent(stickerId)}`,
        {body: {playerId}},
      ),
    );
  }

  public getStickerCatalog(): Promise<StickerDefinition[]> {
    return firstValueFrom(this.httpClient.get<StickerDefinition[]>("/api/sticker-catalog"));
  }

  public getStickerPacks(): Promise<StickerPack[]> {
    return firstValueFrom(this.httpClient.get<StickerPack[]>("/api/sticker-packs"));
  }

}
