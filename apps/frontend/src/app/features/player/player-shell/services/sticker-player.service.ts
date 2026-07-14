import {computed, inject, Injectable} from "@angular/core";
import {
  type BoardStickerPlacement,
  type PlayerSticker,
  type StickerCollageClientAction,
  type StickerCollageGameState,
} from "@stickermania/shared";
import {WorldStore} from '../../../../core/state/world.store';
import {RealtimeRuntimeService} from '../../../../core/runtime/realtime-runtime.service';

@Injectable()
export class StickerPlayerService {
  private readonly worldStore = inject(WorldStore);
  private readonly realtime = inject(RealtimeRuntimeService);

  public readonly gameState = computed<StickerCollageGameState | null>(() =>
    this.worldStore.stickerCollageGameState()
  );

  public readonly playerStickers = computed(() => this.gameState()?.playerStickers ?? {});
  public readonly defaultStickerCatalog = computed(() =>
    this.gameState()?.stickerCatalog.filter(sticker => !sticker.ownerPlayerId) ?? []
  );
  public readonly defaultStickerPacks = computed(() => this.gameState()?.stickerPacks ?? []);
  public readonly allCreatedStickers = computed<PlayerSticker[]>(() =>
    Object.values(this.playerStickers()).flat().sort((left, right) => left.createdAt - right.createdAt)
  );
  public readonly boardPlacements = computed<BoardStickerPlacement[]>(() => this.gameState()?.boardPlacements ?? []);

  public upsertBoardPlacements(placements: BoardStickerPlacement[]): void {
    if (placements.length === 0) return;
    this.sendAction({type: "upsert-board-placements", placements});
  }

  public deleteBoardPlacements(instanceIds: string[]): void {
    if (instanceIds.length === 0) return;
    this.sendAction({type: "delete-board-placements", instanceIds});
  }

  private sendAction(action: StickerCollageClientAction): void {
    this.realtime.send({type: "game-action", action});
  }
}
