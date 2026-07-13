import {Component, computed, OnDestroy, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {PlayerScreenDataService} from './player-screen-data.service';
import {PlayerScreen} from './player-screen.enum';
import type {BoardStickerPlacement, PlayerSticker, StickerDefinition} from '@birthday/shared';
import {PlayerReconnectingComponent} from './scenes/statuses/reconnecting/player-reconnecting.component';
import {PlayerConnectingComponent} from './scenes/statuses/connecting/player-connecting.component';
import {PlayerDisconnectedComponent} from './scenes/statuses/disconnected/player-disconnected.component';
import {PlayerMessageHandler} from '../../../core/realtime/player-message-handler.service';
import {StickerPlayerService} from './services/sticker-player.service';
import {PlayerStickerSpaceMode} from '../sticker-workbench/tabs/player-sticker-workbench-tabs.component';
import {ReconnectService} from '../../../core/realtime/reconnect.service';
import {WorldStore} from '../../../core/state/world.store';
import {LobbyProfileSubmit, ProfileComponent} from '../profile/profile.component';
import {GameSessionStore} from '../../../core/state/session-state.store';
import {StickerWorkbenchComponent} from '../sticker-workbench/sticker-workbench.component';
import {StickerCreatorResult} from '../sticker-workbench/creator/shared/sticker-creator-types';
import {draftStickerEditorUpload, moveDraftStickerLayerSnapshot} from '../sticker-workbench/creator/storage/sticker-layer-storage';
import {prepareStickerUploadDataUrl} from '../sticker-workbench/creator/shared/sticker-upload-image.util';
import {deriveStickerOverlayBoundsFromDataUrl} from '../../../shared/stickers/model/sticker-alpha-mask';
import {BOARD_BOUNDS, type BoardPoint} from '../../../shared/stickers/board-viewport/geometry/sticker-board-types';
import {RealtimeRuntimeService} from '../../../core/runtime/realtime-runtime.service';
import {StickerRuntimeService} from '../../../core/runtime/sticker-runtime.service';
import {SessionRuntimeService} from '../../../core/runtime/session-runtime.service';

@Component({
  selector: "app-player",
  standalone: true,
  imports: [
    ProfileComponent,
    PlayerConnectingComponent,
    PlayerReconnectingComponent,
    PlayerDisconnectedComponent,
    StickerWorkbenchComponent,
  ],
  providers: [
    PlayerMessageHandler,
    StickerPlayerService,
    PlayerScreenDataService,
  ],
  templateUrl: "./player.component.html",
  host: {style: 'display: block; height: 100%;'},
})
export class PlayerComponent implements OnInit, OnDestroy {
  private unsubscribeWs: (() => void) | null = null;

  private forcedScreenFromUrl = signal<PlayerScreen | null>(null);

  public readonly currentScreen = computed<PlayerScreen>(
    () => this.forcedScreenFromUrl() ?? this.screenData.baseScreen()
  );
  public readonly initialStickerSpaceMode = computed<PlayerStickerSpaceMode>(
    () => this.profileEnabled() && this.screenData.needsProfile() && !this.profilePromptDismissed() ? "profile" : "board"
  );

  public readonly PlayerScreen = PlayerScreen;
  public readonly stickerCreateStatus = signal<"idle" | "saving" | "saved" | "error">("idle");
  public readonly stickerDeleteStatus = signal<"idle" | "deleting" | "deleted" | "error">("idle");
  public readonly profileEnabled = computed(() => this.sessionRuntime.supportsPlayerProfiles());
  private readonly profilePromptDismissed = signal(false);
  private readonly lastBoardFocusPoint = signal<BoardPoint | null>(null);

  constructor(
    private readonly realtime: RealtimeRuntimeService,
    private readonly stickerRuntime: StickerRuntimeService,
    private readonly sessionRuntime: SessionRuntimeService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly reconnectService: ReconnectService,
    public readonly sessionStore: GameSessionStore,
    private readonly messageHandler: PlayerMessageHandler,
    public readonly stickerService: StickerPlayerService,
    public readonly screenData: PlayerScreenDataService,
    private readonly worldStore: WorldStore,
  ) {
    const deviceName = this.reconnectService.loadDeviceName();
    if (deviceName) {
      this.sessionStore.playerName.set(deviceName);
    }
  }

  public async ngOnInit(): Promise<void> {
    const forcedScreenParam = this.route.snapshot.queryParamMap.get('screen');
    if (forcedScreenParam) {
      this.forcedScreenFromUrl.set(this.resolveForcedScreen(forcedScreenParam));
      return;
    }

    const reconnect = this.reconnectService.load();
    const localGame = this.sessionRuntime.usesLocalBrowserGame() ? await this.sessionRuntime.getOrCreateLocalGame() : null;
    const hostGame = this.sessionRuntime.usesHostGame() ? await this.sessionRuntime.getOrCreateHostGame() : null;
    const sessionCode = localGame?.sessionCode ?? hostGame?.sessionCode ?? this.reconnectService.resolveSessionCode(this.route);

    if (!sessionCode) {
      await this.router.navigate([], {queryParams: {view: "landing"}});
      return;
    }

    this.messageHandler.sessionCode = sessionCode;

    this.unsubscribeWs = this.realtime.onMessage((msg) => this.messageHandler.handle(msg));
    this.realtime.connect();

    try {
      const resolved = localGame || hostGame
        ? {
          sessionId: (localGame ?? hostGame)!.sessionId,
          sessionCode: (localGame ?? hostGame)!.sessionCode,
          createdAt: (localGame ?? hostGame)!.createdAt,
          expiresAt: (localGame ?? hostGame)!.expiresAt,
        }
        : await this.sessionRuntime.resolveSessionByCode(sessionCode);
      this.sessionStore.setSession(resolved.sessionId);
      this.messageHandler.sessionCode = resolved.sessionCode ?? sessionCode;

      const isSameSession = reconnect?.sessionId === resolved.sessionId;
      const playerId = isSameSession ? (reconnect?.playerId ?? null) : null;
      if (!isSameSession) {
        this.reconnectService.clear();
      }

      this.realtime.send({
        type: "join",
        kind: "player",
        sessionId: resolved.sessionId,
        playerId: playerId ?? undefined,
      });
    } catch {
      this.realtime.disconnect();
      this.reconnectService.clear();
      setTimeout(() => {
        void this.router.navigate([], {
          queryParams: {view: "landing", error: "invalid-session"},
          replaceUrl: true,
        });
      }, 2500);
    }
  }

  public ngOnDestroy(): void {
    this.unsubscribeWs?.();
  }

  public onUserDataSubmitted(name: string, dataUrl?: string | null): void {
    this.reconnectService.clearDeviceAvatar();
    this.realtime.send({ type: "submit-user-data", name: name, avatarDataUrl: dataUrl });
    const playerId = this.sessionStore.playerId();
    if (playerId) {
      this.worldStore.updatePlayerLocal(playerId, {
        name,
        ...(dataUrl !== undefined ? {avatarUrl: dataUrl} : {}),
      });
    }
    this.sessionStore.playerName.set(name);
    this.reconnectService.saveDeviceName(name);
    this.sessionStore.clearTask();
  }

  public onProfileSubmitted(event: LobbyProfileSubmit): void {
    this.profilePromptDismissed.set(true);
    this.onUserDataSubmitted(event.name, event.avatarDataUrl);
  }

  public async onCreateSticker(event: StickerCreatorResult): Promise<void> {
    const playerId = this.sessionStore.playerId();
    if (!playerId) {
      this.stickerCreateStatus.set("error");
      return;
    }
    const stickerId = `sticker_${playerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await this.uploadSticker(stickerId, event.dataUrl, event.name, {
      adoptDraftLayers: event.adoptDraftLayers ?? true,
      packId: event.packId,
      placeOnBoard: true,
    });
  }

  public async onUpdateSticker(event: {stickerId: string; dataUrl: string; name: string; packId?: string}): Promise<void> {
    await this.uploadSticker(event.stickerId, event.dataUrl, event.name, {
      adoptDraftLayers: true,
      packId: event.packId,
    });
  }

  public async onCreateStickerPackRequested(name: string): Promise<void> {
    const sessionId = this.sessionStore.sessionId();
    const playerId = this.sessionStore.playerId();
    if (!sessionId || !playerId) {
      return;
    }

    try {
      const result = await this.stickerRuntime.createPlayerStickerPack(sessionId, playerId, name);
      this.worldStore.addStickerPackLocal(result.pack);
    } catch {
      console.error("Could not create sticker pack");
    }
  }

  public async onMoveStickerToPackRequested(event: {stickerId: string; packId: string}): Promise<void> {
    const sessionId = this.sessionStore.sessionId();
    const playerId = this.sessionStore.playerId();
    if (!sessionId || !playerId) {
      return;
    }

    try {
      const result = await this.stickerRuntime.moveStickerToPack(sessionId, playerId, event.stickerId, event.packId);
      this.worldStore.moveStickerToPackLocal(result.sticker);
    } catch {
      console.error("Could not move sticker to pack");
    }
  }

  public async onDeleteStickerPackRequested(packId: string): Promise<void> {
    const sessionId = this.sessionStore.sessionId();
    const playerId = this.sessionStore.playerId();
    if (!sessionId || !playerId) {
      return;
    }

    try {
      const result = await this.stickerRuntime.deletePlayerStickerPack(sessionId, playerId, packId);
      this.worldStore.setStickerPacksLocal(result.packs);
    } catch {
      console.error("Could not delete sticker pack");
    }
  }

  public async onDeleteSticker(event: {stickerId: string}) {
    const sessionId = this.sessionStore.sessionId();
    const playerId = this.sessionStore.playerId();
    if (!sessionId || !playerId) {
      this.stickerDeleteStatus.set("error");
      return;
    }

    this.stickerDeleteStatus.set("deleting");
    try {
      await this.stickerRuntime.deleteStickerImage(sessionId, playerId, event.stickerId);
      this.worldStore.deleteStickerLocal(event.stickerId);
      this.stickerDeleteStatus.set("deleted");
      setTimeout(() => {
        if (this.stickerDeleteStatus() === "deleted") {
          this.stickerDeleteStatus.set("idle");
        }
      }, 1500);
    } catch {
      console.error("Could not delete sticker");
      this.stickerDeleteStatus.set("error");
    }
  }

  private async uploadSticker(
    stickerId: string,
    imageDataUrl: string,
    stickerName: string,
    options: {adoptDraftLayers?: boolean; packId?: string; placeOnBoard?: boolean} = {},
  ): Promise<void> {
    const sessionId = this.sessionStore.sessionId();
    const playerId = this.sessionStore.playerId();
    if (!sessionId || !playerId) {
      this.stickerCreateStatus.set("error");
      return;
    }

    this.stickerCreateStatus.set("saving");
    try {
      const adoptDraftLayers = options.adoptDraftLayers ?? false;
      const uploadDataUrl = await prepareStickerUploadDataUrl(imageDataUrl);
      const overlayBounds = await deriveStickerOverlayBoundsFromDataUrl(uploadDataUrl);
      const editorData = adoptDraftLayers ? draftStickerEditorUpload() : undefined;
      const saved = await this.stickerRuntime.uploadStickerImage(sessionId, playerId, stickerId, uploadDataUrl, stickerName, options.packId, overlayBounds, editorData);
      if (adoptDraftLayers) {
        moveDraftStickerLayerSnapshot(stickerId);
      }
      const localSticker = {
        ...saved.sticker,
        imageUrl: uploadDataUrl,
        ...(overlayBounds ? {overlayBounds} satisfies Pick<StickerDefinition, "overlayBounds"> : {}),
      };
      this.worldStore.addCreatedStickerLocal(localSticker);
      if (options.placeOnBoard) {
        this.placeCreatedStickerOnBoard(localSticker);
      }
      this.stickerCreateStatus.set("saved");
      setTimeout(() => {
        if (this.stickerCreateStatus() === "saved") {
          this.stickerCreateStatus.set("idle");
        }
      }, 1500);
    } catch {
      console.error("Could not upload sticker");
      this.stickerCreateStatus.set("error");
    }
  }

  private placeCreatedStickerOnBoard(sticker: PlayerSticker): void {
    const playerId = this.sessionStore.playerId();
    if (!playerId) {
      return;
    }

    const now = Date.now();
    const existingPlacements = this.stickerService.boardPlacements();
    const maxZIndex = existingPlacements.length
      ? Math.max(...existingPlacements.map(placement => placement.zIndex ?? 0))
      : 0;
    const position = this.createdStickerBoardPosition();
    const placement: BoardStickerPlacement = {
      instanceId: `inst_${sticker.id}_${now}_${Math.random().toString(36).slice(2, 8)}`,
      stickerId: sticker.id,
      ownerPlayerId: sticker.ownerPlayerId,
      placedByPlayerId: playerId,
      x: position.x,
      y: position.y,
      rotation: 0,
      scale: 1,
      zIndex: maxZIndex + 1,
      updatedAt: now,
    };

    this.worldStore.upsertBoardPlacementsLocal([placement]);
    this.stickerService.upsertBoardPlacements([placement]);
  }

  public onUpsertBoardPlacements(placements: BoardStickerPlacement[]): void {
    this.stickerService.upsertBoardPlacements(placements);
  }

  public onDeleteBoardPlacements(instanceIds: string[]): void {
    this.stickerService.deleteBoardPlacements(instanceIds);
  }

  public onBoardFocusChanged(point: BoardPoint): void {
    this.lastBoardFocusPoint.set(this.clampBoardPoint(point));
  }

  private createdStickerBoardPosition(): BoardPoint {
    return this.lastBoardFocusPoint() ?? this.defaultBoardCenter();
  }

  private defaultBoardCenter(): BoardPoint {
    return {
      x: (BOARD_BOUNDS.minX + BOARD_BOUNDS.maxX) / 2,
      y: (BOARD_BOUNDS.minY + BOARD_BOUNDS.maxY) / 2,
    };
  }

  private clampBoardPoint(point: BoardPoint): BoardPoint {
    return {
      x: Math.max(BOARD_BOUNDS.minX, Math.min(BOARD_BOUNDS.maxX, point.x)),
      y: Math.max(BOARD_BOUNDS.minY, Math.min(BOARD_BOUNDS.maxY, point.y)),
    };
  }

  private resolveForcedScreen(screen: string): PlayerScreen {
    if (screen === "lobby-name" || screen === "lobby-avatar") {
      return PlayerScreen.LOBBY_PROFILE;
    }
    return screen as PlayerScreen;
  }
}
