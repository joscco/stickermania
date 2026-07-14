import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import type {StickerDefinition, StickerEditorUpload, StickerPack} from "@stickermania/shared";
import {firstValueFrom} from "rxjs";

@Injectable({ providedIn: "root" })
export class DevCatalogApiService {
  public constructor(private readonly httpClient: HttpClient) {}

  public saveDevDefaultSticker(imageDataUrl: string, stickerId?: string, stickerName?: string, packId?: string, editorData?: StickerEditorUpload): Promise<{ok: boolean; sticker: StickerDefinition; pack: StickerPack; packs?: StickerPack[]}> {
    return firstValueFrom(
      this.httpClient.post<{ok: boolean; sticker: StickerDefinition; pack: StickerPack; packs?: StickerPack[]}>(
        "/api/dev/default-stickers",
        {imageDataUrl, stickerId, stickerName, packId, editorData},
      ),
    );
  }

  public createDevDefaultStickerPack(name: string): Promise<{ok: boolean; pack: StickerPack; packs: StickerPack[]}> {
    return firstValueFrom(
      this.httpClient.post<{ok: boolean; pack: StickerPack; packs: StickerPack[]}>(
        "/api/dev/default-sticker-packs",
        {name},
      ),
    );
  }

  public deleteDevDefaultStickerPack(packId: string): Promise<{ok: boolean; packs: StickerPack[]}> {
    return firstValueFrom(
      this.httpClient.delete<{ok: boolean; packs: StickerPack[]}>(
        `/api/dev/default-sticker-packs/${encodeURIComponent(packId)}`,
      ),
    );
  }

  public moveDevDefaultStickerToPack(stickerId: string, packId: string): Promise<{ok: boolean; sticker: StickerDefinition; pack: StickerPack; packs: StickerPack[]}> {
    return firstValueFrom(
      this.httpClient.patch<{ok: boolean; sticker: StickerDefinition; pack: StickerPack; packs: StickerPack[]}>(
        `/api/dev/default-stickers/${encodeURIComponent(stickerId)}/pack`,
        {packId},
      ),
    );
  }

  public deleteDevDefaultSticker(stickerId: string): Promise<{ok: boolean; pack: StickerPack; packs?: StickerPack[]}> {
    return firstValueFrom(
      this.httpClient.delete<{ok: boolean; pack: StickerPack; packs?: StickerPack[]}>(
        `/api/dev/default-stickers/${encodeURIComponent(stickerId)}`,
      ),
    );
  }
}
