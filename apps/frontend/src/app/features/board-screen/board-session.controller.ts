import {computed, effect, Injectable, OnDestroy, signal} from "@angular/core";
import {type BoardStickerPlacement, type ServerToClientMessage, type StickerDefinition, type StickerPlacement} from "@birthday/shared";
import {RealtimeRuntimeService} from "../../core/runtime/realtime-runtime.service";
import {WorldStore} from "../../core/state/world.store";
import {boardPlacementListSignature, diffBoardPlacementPatch} from "../../shared/stickers/board-viewport/sync/board-placement-patch";
import {BoardPlacementPatchQueue} from "../../shared/stickers/board-viewport/sync/board-placement-patch-queue";
import {BoardScreenDataService} from "./board-screen-data.service";

export type BoardMode = "view" | "edit";

@Injectable()
export class BoardSessionController implements OnDestroy {
  public readonly playerQrDataUrl = signal<string | null>(null);
  public readonly isBoardReady = signal(false);
  public readonly isBootstrapping = signal(true);
  public readonly bootErrorText = signal<string | null>(null);
  public readonly sessionCode = signal<string | null>(null);
  public readonly playerJoinUrl = signal<string | null>(null);
  public readonly hostAccessUrls = signal<string[]>([]);
  public readonly hostPort = signal<number | null>(null);
  public readonly boardMode = signal<BoardMode>("edit");
  public readonly showPlacementAuthors = signal(false);
  public readonly boardEditorPlacements = signal<BoardStickerPlacement[]>([]);
  public readonly gameState = computed(() => this.screenData.gameState());
  public readonly stickerCatalog = computed<StickerDefinition[]>(() => [
    ...(this.gameState()?.stickerCatalog ?? []),
    ...Object.values(this.screenData.stickersById()).map(sticker => ({
      id: sticker.id,
      name: sticker.name,
      imageUrl: sticker.imageUrl,
      packId: sticker.packId ?? `player-${sticker.ownerPlayerId}`,
      ownerPlayerId: sticker.ownerPlayerId,
      createdAt: sticker.createdAt,
    })),
  ]);
  public readonly placementBadges = computed(() => {
    const badges: Record<string, {name: string; avatarUrl: string | null}> = {};
    const players = this.screenData.players();
    for (const placement of this.boardEditorPlacements()) {
      const player = players[placement.ownerPlayerId] ?? players[placement.placedByPlayerId];
      badges[placement.instanceId] = {
        name: player?.name?.trim() || "Spieler",
        avatarUrl: player?.avatarUrl ?? null,
      };
    }
    return badges;
  });

  private sessionId: string | null = null;
  private unsubscribeWs: (() => void) | null = null;
  private joinInterval: number | null = null;
  private lastBoardInputSignature = "";
  private awaitingBoardAck = false;
  private readonly boardPatchQueue = new BoardPlacementPatchQueue({
    flushDelayMs: 180,
    flush: patch => this.sendBoardPatch(patch),
  });

  public constructor(
    private readonly realtime: RealtimeRuntimeService,
    public readonly worldStore: WorldStore,
    public readonly screenData: BoardScreenDataService,
  ) {
    effect(() => {
      const incoming = this.gameState()?.boardPlacements ?? [];
      const signature = boardPlacementListSignature(incoming);

      if (signature === this.lastBoardInputSignature) {
        this.awaitingBoardAck = false;
        return;
      }

      if (this.boardPatchQueue.hasPending() || this.awaitingBoardAck) {
        return;
      }

      this.lastBoardInputSignature = signature;
      this.boardEditorPlacements.set(incoming.map(placement => ({...placement})));
    });
  }

  public ngOnDestroy(): void {
    this.cleanup();
  }

  public get currentSessionId(): string | null {
    return this.sessionId;
  }

  public setBoardMode(mode: BoardMode): void {
    this.boardMode.set(mode);
    if (mode === "edit") {
      this.showPlacementAuthors.set(false);
    } else {
      this.boardPatchQueue.flush();
    }
  }

  public setPlacementAuthorsVisible(visible: boolean): void {
    this.showPlacementAuthors.set(visible);
  }

  public onBoardPlacementsChanged(placements: StickerPlacement[]): void {
    const previousPlacements = this.boardEditorPlacements();
    const now = Date.now();
    const boardPlacements: BoardStickerPlacement[] = placements.map((placement, index) => ({
      ...placement,
      ownerPlayerId: (placement as BoardStickerPlacement).ownerPlayerId ?? (placement as BoardStickerPlacement).placedByPlayerId ?? "__board__",
      placedByPlayerId: (placement as BoardStickerPlacement).placedByPlayerId ?? (placement as BoardStickerPlacement).ownerPlayerId ?? "__board__",
      updatedAt: now,
      zIndex: placement.zIndex ?? index + 1,
      groupId: undefined,
    }));
    this.boardEditorPlacements.set(boardPlacements);
    this.lastBoardInputSignature = boardPlacementListSignature(boardPlacements);

    const patch = diffBoardPlacementPatch(previousPlacements, boardPlacements);
    this.boardPatchQueue.queue(patch.upserts, patch.deletes);
  }

  public onBoardSelectionChanged(active: boolean): void {
    if (!active) {
      this.boardPatchQueue.flush();
    }
  }

  public clearBoardPlacements(): boolean {
    const placementIds = this.boardEditorPlacements().map(placement => placement.instanceId);
    if (placementIds.length === 0) {
      return false;
    }

    this.boardEditorPlacements.set([]);
    this.lastBoardInputSignature = boardPlacementListSignature([]);
    this.boardPatchQueue.queue([], placementIds);
    this.boardPatchQueue.flush();
    return true;
  }

  public connectToSession(sessionId: string): void {
    this.disconnectRealtime();
    this.sessionId = sessionId;
    this.unsubscribeWs = this.realtime.onMessage((message) => this.handleMessage(message));
    this.realtime.connect();
    this.joinInterval = window.setInterval(() => {
      if (this.realtime.status() === "connected" && this.sessionId) {
        this.realtime.send({type: "join", kind: "board", sessionId: this.sessionId});
        this.clearJoinInterval();
      }
    }, 200);
  }

  public cleanup(): void {
    this.boardPatchQueue.clear();
    this.awaitingBoardAck = false;
    this.lastBoardInputSignature = "";
    this.boardEditorPlacements.set([]);
    this.sessionCode.set(null);
    this.playerJoinUrl.set(null);
    this.playerQrDataUrl.set(null);
    this.hostAccessUrls.set([]);
    this.hostPort.set(null);
    this.disconnectRealtime();
    this.worldStore.clearSessionState();
    this.isBoardReady.set(false);
  }

  private disconnectRealtime(): void {
    this.clearJoinInterval();
    if (this.unsubscribeWs) {
      this.unsubscribeWs();
      this.unsubscribeWs = null;
    }
    this.realtime.disconnect();
  }

  private clearJoinInterval(): void {
    if (this.joinInterval !== null) {
      window.clearInterval(this.joinInterval);
      this.joinInterval = null;
    }
  }

  private handleMessage(message: ServerToClientMessage): void {
    if (message.type === "session-state") {
      this.worldStore.setSessionState(message.state);
      return;
    }
    if (message.type === "game-event") {
      switch (message.event.type) {
        case "sticker-created":
          this.worldStore.addCreatedStickerLocal(message.event.sticker);
          break;
        case "sticker-deleted":
          this.worldStore.deleteStickerLocal(message.event.stickerId);
          break;
        case "board-updated":
          break;
      }
    }
  }

  private sendBoardPatch(patch: {upserts: BoardStickerPlacement[]; deletes: string[]}): void {
    this.awaitingBoardAck = true;

    if (patch.deletes.length > 0) {
      this.realtime.send({type: "game-action", action: {type: "delete-board-placements", instanceIds: patch.deletes}});
    }

    if (patch.upserts.length > 0) {
      this.realtime.send({type: "game-action", action: {type: "upsert-board-placements", placements: patch.upserts}});
    }
  }
}
