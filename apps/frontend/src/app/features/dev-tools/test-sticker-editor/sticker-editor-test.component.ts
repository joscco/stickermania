import {CommonModule} from "@angular/common";
import {Component, computed, OnInit, signal} from "@angular/core";
import type {BoardStickerPlacement, PlayerSticker, SessionPlayer, StickerDefinition, StickerPack} from "@stickermania/shared";
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import {MOCK_CATALOG, MOCK_PLAYERS, MOCK_SHAPES_PACK} from '../testing/mock-data';
import {DevCatalogApiService} from '../../../core/api/dev-catalog-api.service';
import {StickerApiService} from '../../../core/api/sticker-api.service';
import {StickerWorkbenchComponent} from '../../player/sticker-workbench/sticker-workbench.component';
import {StickerCreatorResult} from '../../player/sticker-workbench/creator/shared/sticker-creator-types';
import {draftStickerEditorUpload, moveDraftStickerLayerSnapshot} from '../../player/sticker-workbench/creator/storage/sticker-layer-storage';

const DEV_PLAYER_ID = "player-1";
const DEV_DEFAULT_PACK_ID = "default";

@Component({
  selector: "app-sticker-editor-test",
  standalone: true,
  imports: [CommonModule, StickerWorkbenchComponent],
  templateUrl: "./sticker-editor-test.component.html",
})
export class StickerEditorTestComponent implements OnInit {
  readonly playerId = DEV_PLAYER_ID;
  readonly players = MOCK_PLAYERS as Record<string, SessionPlayer>;
  readonly stickers = signal<PlayerSticker[]>(this.toEditableDevStickers(this.defaultCatalogFallback()));
  readonly boardPlacements = signal<BoardStickerPlacement[]>([]);
  readonly createStatus = signal<"idle" | "saving" | "saved" | "error">("idle");
  readonly defaultStickerCatalog = signal<StickerDefinition[]>(MOCK_CATALOG.map(sticker => ({
    ...sticker,
    packId: DEV_DEFAULT_PACK_ID,
  })));
  readonly defaultStickerPacks = signal<StickerPack[]>([
    {
      ...MOCK_SHAPES_PACK,
      id: DEV_DEFAULT_PACK_ID,
      name: "Default",
      stickerIds: MOCK_CATALOG.map(sticker => sticker.id)
    },
  ]);
  readonly editableStickerPacks = computed<StickerPack[]>(() =>
    this.defaultStickerPacks().map(pack => ({...pack, ownerPlayerId: DEV_PLAYER_ID}))
  );

  constructor(
    private readonly devCatalogApiService: DevCatalogApiService,
    private readonly stickerApiService: StickerApiService
  ) {
  }

  async ngOnInit(): Promise<void> {
    try {
      const [catalog, packs] = await Promise.all([
        this.stickerApiService.getStickerCatalog(),
        this.stickerApiService.getStickerPacks(),
      ]);
      this.defaultStickerCatalog.set(catalog);
      this.defaultStickerPacks.set(packs);
      this.syncEditableDevStickers(catalog);
    } catch {
      // Keep mock fallback so the editor still opens if the dev API is unavailable.
    }
  }

  async onCreateSticker(event: StickerCreatorResult): Promise<void> {
    await this.saveDefaultSticker(event.dataUrl, undefined, event.name);
  }

  async onUpdateSticker(event: { stickerId: string; dataUrl: string; name: string }): Promise<void> {
    await this.saveDefaultSticker(event.dataUrl, event.stickerId, event.name);
  }

  async onDeleteSticker(event: { stickerId: string }): Promise<void> {
    this.createStatus.set("saving");
    try {
      const result = await this.devCatalogApiService.deleteDevDefaultSticker(event.stickerId);
      this.defaultStickerCatalog.update(catalog => catalog.filter(sticker => sticker.id !== event.stickerId));
      this.defaultStickerPacks.set(result.packs ?? this.defaultStickerPacks().filter(pack => pack.id !== result.pack.id).concat(result.pack));
      this.syncEditableDevStickers(this.defaultStickerCatalog());
      this.createStatus.set("idle");
    } catch {
      this.createStatus.set("error");
    }
  }

  async onCreatePackRequested(name: string): Promise<void> {
    const normalizedName = name.trim().replace(/\s+/g, " ").slice(0, STICKERMANIA_CONFIG.stickerPacks.maxNameLength);
    if (!normalizedName) return;
    try {
      const result = await this.devCatalogApiService.createDevDefaultStickerPack(normalizedName);
      this.defaultStickerPacks.set(result.packs);
    } catch {
      this.createStatus.set("error");
    }
  }

  async onMoveStickerToPackRequested(event: { stickerId: string; packId: string }): Promise<void> {
    try {
      const result = await this.devCatalogApiService.moveDevDefaultStickerToPack(event.stickerId, event.packId);
      this.defaultStickerCatalog.update(catalog => catalog.map(sticker => sticker.id === result.sticker.id ? result.sticker : sticker));
      this.defaultStickerPacks.set(result.packs);
      this.syncEditableDevStickers(this.defaultStickerCatalog());
    } catch {
      this.createStatus.set("error");
    }
  }

  async onDeletePackRequested(packId: string): Promise<void> {
    if (packId === DEV_DEFAULT_PACK_ID) return;
    try {
      const result = await this.devCatalogApiService.deleteDevDefaultStickerPack(packId);
      this.defaultStickerPacks.set(result.packs);
      const catalog = await this.stickerApiService.getStickerCatalog();
      this.defaultStickerCatalog.set(catalog);
      this.syncEditableDevStickers(catalog);
    } catch {
      this.createStatus.set("error");
    }
  }

  private async saveDefaultSticker(imageDataUrl: string, stickerId?: string, stickerName?: string): Promise<void> {
    this.createStatus.set("saving");
    try {
      const currentPackId = stickerId ? this.stickers().find(sticker => sticker.id === stickerId)?.packId : undefined;
      const saved = await this.devCatalogApiService.saveDevDefaultSticker(imageDataUrl, stickerId, stickerName, currentPackId, draftStickerEditorUpload());
      moveDraftStickerLayerSnapshot(saved.sticker.id);
      const localSticker = {...saved.sticker, imageUrl: imageDataUrl};
      this.defaultStickerCatalog.update(catalog => [
        ...catalog.filter(sticker => sticker.id !== saved.sticker.id),
        localSticker,
      ]);
      this.defaultStickerPacks.set(saved.packs ?? this.defaultStickerPacks().filter(pack => pack.id !== saved.pack.id).concat(saved.pack));
      this.syncEditableDevStickers(this.defaultStickerCatalog());
      this.createStatus.set("saved");
      setTimeout(() => {
        if (this.createStatus() === "saved") this.createStatus.set("idle");
      }, 1000);
    } catch {
      this.createStatus.set("error");
    }
  }

  private syncEditableDevStickers(catalog: StickerDefinition[]): void {
    this.stickers.set(this.toEditableDevStickers(catalog));
  }

  private toEditableDevStickers(catalog: StickerDefinition[]): PlayerSticker[] {
    return catalog.map(sticker => ({
      id: sticker.id,
      name: sticker.name,
      ownerPlayerId: DEV_PLAYER_ID,
      imageUrl: sticker.imageUrl,
      assetPath: sticker.imageUrl,
      createdAt: sticker.createdAt ?? 0,
      packId: sticker.packId,
      editorData: sticker.editorData,
    }));
  }

  private defaultCatalogFallback(): StickerDefinition[] {
    return MOCK_CATALOG.map(sticker => ({
      ...sticker,
      packId: DEV_DEFAULT_PACK_ID,
    }));
  }

  onUpsertBoardPlacements(placements: BoardStickerPlacement[]): void {
    const merged = new Map(this.boardPlacements().map(placement => [placement.instanceId, placement]));
    placements.forEach(placement => merged.set(placement.instanceId, placement));
    this.boardPlacements.set([...merged.values()].sort((left, right) => left.zIndex - right.zIndex));
  }

  onDeleteBoardPlacements(instanceIds: string[]): void {
    const deleteIds = new Set(instanceIds);
    this.boardPlacements.set(this.boardPlacements().filter(placement => !deleteIds.has(placement.instanceId)));
  }
}
