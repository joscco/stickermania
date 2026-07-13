import {CommonModule} from "@angular/common";
import {Component, computed, effect, input, OnDestroy, output, signal, ViewChild} from "@angular/core";
import {type BoardStickerPlacement, type PlayerSticker, type SessionPlayer, type StickerDefinition, type StickerPack} from "@birthday/shared";
import {AnimPresenceDirective} from '../../../../shared/ui/animations/anim-on-init.directive';
import {
  buildCreatedStickerCatalog,
  buildCreatedStickerPacks,
  buildDefaultStickerIds,
  buildPlacementBadges,
  buildStickerCatalog,
  buildStickerPacks,
  editablePlacementIdsForPlayer,
  wasPlacementPlacedByPlayer,
} from "./player-board-catalog.model";
import {
  PlayerBoardSyncController,
  type PlayerBoardSaveState,
} from "./player-board-sync.controller";
import {BOARD_BOUNDS, BOARD_VIEW_CONFIG, type BoardPoint} from '../../../../shared/stickers/board-viewport/geometry/sticker-board-types';
import {overlayBox} from '../../../../shared/stickers/placement-canvas/rendering/sticker-transform.util';
import {normalizeZIndexes} from '../../../../shared/stickers/model/sticker-placement-ops';
import {StickerCatalogPickerComponent, StickerDragStartEvent} from '../../../../shared/stickers/catalog-picker/sticker-catalog-picker.component';
import {PlayerBoardControlsComponent} from './player-board-controls.component';
import {StickerBoardViewportComponent} from '../../../../shared/stickers/board-viewport/surface/sticker-board-viewport.component';
import {type BoardActionButtonState} from '../../../../shared/stickers/board-actions/board-action-button.component';

@Component({
  selector: "app-player-board-editor",
  standalone: true,
  imports: [CommonModule, AnimPresenceDirective, StickerBoardViewportComponent, PlayerBoardControlsComponent, StickerCatalogPickerComponent],
  templateUrl: "./player-board-editor.component.html",
})
export class PlayerBoardEditorComponent implements OnDestroy {
  readonly playerId = input<string>("");
  readonly players = input<Record<string, SessionPlayer>>({});
  readonly stickers = input<PlayerSticker[]>([]);
  readonly defaultStickerCatalog = input<StickerDefinition[]>([]);
  readonly defaultStickerPacks = input<StickerPack[]>([]);
  readonly boardPlacements = input<BoardStickerPlacement[]>([]);
  readonly showPlacementAuthorControls = input(true);
  readonly showBoardActions = input(false);
  readonly boardExportState = input<BoardActionButtonState>("idle");
  readonly boardResetState = input<BoardActionButtonState>("idle");
  readonly upsertBoardPlacements = output<BoardStickerPlacement[]>();
  readonly deleteBoardPlacements = output<string[]>();
  readonly exportBoardRequested = output<Event>();
  readonly resetBoardRequested = output<Event>();
  readonly boardFocusChanged = output<BoardPoint>();

  @ViewChild("boardSurface") private boardSurface?: StickerBoardViewportComponent;

  readonly showBoardPicker = signal(false);
  readonly boardPickerClosing = signal(false);
  readonly boardMode = signal<"view" | "edit">("edit");
  readonly boardSaveState = signal<"idle" | "saving" | "saved" | "error">("idle");
  readonly showBoardSaveState = signal(false);
  readonly boardEditorPlacements = signal<BoardStickerPlacement[]>([]);
  readonly boardStickerSelected = signal(false);
  readonly boardSaveStateText = signal<string>("");
  readonly showPlacementAuthors = signal(false);

  private boardPickerCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly boardSync = new PlayerBoardSyncController({
    getEditorPlacements: () => this.boardEditorPlacements(),
    setEditorPlacements: placements => this.boardEditorPlacements.set(placements),
    normalizePlacements: placements => this.normalizeBoardZIndexes(placements),
    isLocalPlacement: placement => this.wasPlacedByCurrentPlayer(placement),
    setSaveState: state => this.setBoardSaveState(state),
    emitPatch: patch => {
      if (patch.deletes.length > 0) {
        this.deleteBoardPlacements.emit(patch.deletes);
      }

      if (patch.upserts.length > 0) {
        this.upsertBoardPlacements.emit(patch.upserts);
      }
    },
  });

  readonly defaultStickerIds = computed(() =>
    buildDefaultStickerIds(this.defaultStickerCatalog())
  );

  readonly createdStickerCatalog = computed<StickerDefinition[]>(() =>
    buildCreatedStickerCatalog(this.stickers(), this.defaultStickerIds())
  );

  readonly stickerCatalog = computed<StickerDefinition[]>(() =>
    buildStickerCatalog(this.defaultStickerCatalog(), this.createdStickerCatalog())
  );

  readonly canEditBoard = computed(() => this.stickerCatalog().length > 0);

  readonly createdStickerPacks = computed<StickerPack[]>(() =>
    buildCreatedStickerPacks({
      defaultStickerPacks: this.defaultStickerPacks(),
      stickers: this.stickers(),
      defaultStickerIds: this.defaultStickerIds(),
      players: this.players(),
      currentPlayerId: this.playerId(),
    })
  );

  readonly stickerPacks = computed<StickerPack[]>(() =>
    buildStickerPacks(this.createdStickerPacks(), this.defaultStickerPacks())
  );

  readonly placementBadges = computed(() =>
    buildPlacementBadges(this.boardEditorPlacements(), this.players())
  );

  readonly editableBoardPlacementIds = computed(() =>
    editablePlacementIdsForPlayer(this.boardEditorPlacements(), this.playerId())
      .filter(instanceId => !this.isBoardPlacementLocked(instanceId))
  );

  readonly unlockableBoardPlacementIds = computed(() =>
    editablePlacementIdsForPlayer(this.boardEditorPlacements(), this.playerId())
      .filter(instanceId => this.isBoardPlacementLocked(instanceId))
  );

  constructor() {
    effect(() => {
      this.boardSync.syncIncomingPlacements(this.boardPlacements());
    });
    effect(() => {
      if (!this.showPlacementAuthorControls()) {
        this.showPlacementAuthors.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.boardSync.dispose();

    if (this.boardPickerCloseTimer) {
      clearTimeout(this.boardPickerCloseTimer);
      this.boardPickerCloseTimer = null;
    }
  }

  onBoardPlacementsChanged(placements: BoardStickerPlacement[]): void {
    const nextPlacements = placements.map(placement => ({
      ...placement,
      ownerPlayerId: placement.ownerPlayerId ?? this.playerId(),
      placedByPlayerId: placement.placedByPlayerId ?? this.playerId(),
      updatedAt: placement.updatedAt ?? Date.now(),
    }));

    this.boardSync.applyLocalPlacements(nextPlacements, {
      flushImmediately: !this.boardStickerSelected(),
    });
  }

  onBoardSelectionChanged(active: boolean): void {
    const wasActive = this.boardStickerSelected();
    this.boardStickerSelected.set(active);

    if (!wasActive || active) {
      return;
    }

    this.boardSync.finishActiveTransform();
  }

  onBoardFocusChanged(point: BoardPoint): void {
    this.boardFocusChanged.emit(this.clampBoardPoint(point));
  }

  setBoardMode(mode: "view" | "edit"): void {
    if (mode === "edit" && !this.canEditBoard()) return;
    this.boardMode.set(mode);
    this.closeBoardPicker();
    if (mode === "edit") {
      this.showPlacementAuthors.set(false);
    }
    if (mode === "view") {
      this.boardSurface?.clearSelection();
      this.boardSync.flushPendingChanges();
      this.boardStickerSelected.set(false);
    }
  }

  setPlacementAuthorsVisible(visible: boolean): void {
    if (!this.showPlacementAuthorControls()) {
      this.showPlacementAuthors.set(false);
      return;
    }
    this.showPlacementAuthors.set(visible);
  }

  addStickerToBoard(event: StickerDragStartEvent): void {
    const surface = this.boardSurface;
    const now = Date.now();
    const existing = this.boardEditorPlacements();
    const maxZ = existing.length ? Math.max(...existing.map(placement => placement.zIndex)) : 0;
    const position = this.clampBoardPoint(surface?.viewportCenterBoardPoint() ?? this.defaultBoardCenter());
    const definition = this.stickerCatalog().find(sticker => sticker.id === event.stickerId);
    const placement: BoardStickerPlacement = {
      instanceId: surface?.generateInstanceId() ?? `inst_${now}_${Math.random().toString(36).slice(2, 8)}`,
      stickerId: event.stickerId,
      ownerPlayerId: definition?.ownerPlayerId ?? this.playerId(),
      placedByPlayerId: this.playerId(),
      x: position.x,
      y: position.y,
      rotation: 0,
      scale: 1,
      zIndex: maxZ + 1,
      updatedAt: now,
    };
    placement.scale = this.initialBoardStickerScale(placement, definition);
    this.boardSync.applyLocalPlacements([...existing, placement], {
      flushImmediately: false,
    });

    this.closeBoardPicker();
    surface?.selectAndAnimate(placement.instanceId);
  }

  openBoardPicker(): void {
    if (!this.canEditBoard() || this.boardMode() !== "edit") {
      return;
    }

    this.boardSurface?.clearSelection();
    if (this.boardPickerCloseTimer) {
      clearTimeout(this.boardPickerCloseTimer);
      this.boardPickerCloseTimer = null;
    }
    this.boardPickerClosing.set(false);
    this.showBoardPicker.set(true);
  }

  closeBoardPicker(): void {
    if (!this.showBoardPicker()) return;
    if (this.boardPickerClosing()) return;
    this.boardPickerClosing.set(true);
    if (this.boardPickerCloseTimer) {
      clearTimeout(this.boardPickerCloseTimer);
    }
    this.boardPickerCloseTimer = setTimeout(() => {
      this.showBoardPicker.set(false);
      this.boardPickerClosing.set(false);
      this.boardPickerCloseTimer = null;
    }, 260);
  }

  private defaultBoardCenter(): { x: number; y: number } {
    const bounds = BOARD_BOUNDS;
    return {x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2};
  }

  private clampBoardPoint(point: { x: number; y: number }): { x: number; y: number } {
    const bounds = BOARD_BOUNDS;
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
      y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y)),
    };
  }

  private normalizeBoardZIndexes(placements: BoardStickerPlacement[]): BoardStickerPlacement[] {
    if (this.hasSequentialBoardZIndexes(placements)) {
      return placements;
    }

    return normalizeZIndexes(placements) as BoardStickerPlacement[];
  }

  private hasSequentialBoardZIndexes(placements: BoardStickerPlacement[]): boolean {
    const seenZIndexes = new Set<number>();

    for (const placement of placements) {
      if (!Number.isInteger(placement.zIndex) || placement.zIndex < 1 || placement.zIndex > placements.length) {
        return false;
      }

      if (seenZIndexes.has(placement.zIndex)) {
        return false;
      }

      seenZIndexes.add(placement.zIndex);
    }

    return seenZIndexes.size === placements.length;
  }

  private initialBoardStickerScale(placement: BoardStickerPlacement, definition: StickerDefinition | undefined): number {
    const box = overlayBox(placement, definition, BOARD_VIEW_CONFIG.stickerBaseSize);
    const maxDimension = Math.max(box?.w ?? 0, box?.h ?? 0);
    if (maxDimension <= BOARD_VIEW_CONFIG.stickerBaseSize || maxDimension <= 0) {
      return 1;
    }
    return BOARD_VIEW_CONFIG.stickerBaseSize / maxDimension;
  }

  private wasPlacedByCurrentPlayer(placement: BoardStickerPlacement): boolean {
    return wasPlacementPlacedByPlayer(placement, this.playerId());
  }

  private isBoardPlacementLocked(instanceId: string): boolean {
    return !!(this.boardEditorPlacements().find(placement => placement.instanceId === instanceId) as (BoardStickerPlacement & {locked?: boolean}) | undefined)?.locked;
  }

  private setBoardSaveState(state: PlayerBoardSaveState): void {
    this.boardSaveState.set(state);
    this.showBoardSaveState.set(state == "error");

    switch (state) {
      case "saving": {
        this.boardSaveStateText.set("Board wird gespeichert...");
        break;
      }
      case "saved": {
        this.boardSaveStateText.set("Board gespeichert.");
        break;
      }
      case "error": {
        this.boardSaveStateText.set("Keine Speicher-Bestätigung erhalten.");
        break;
      }
      case "idle": {
        break;
      }
    }
  }

}
