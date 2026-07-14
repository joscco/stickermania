import {CommonModule} from "@angular/common";
import {Component, computed, effect, inject, input, output, signal} from "@angular/core";
import {type BoardStickerPlacement, type PlayerSticker, type SessionPlayer, type StickerDefinition, type StickerPack} from "@stickermania/shared";
import {PlayerStickerSpaceMode, PlayerStickerWorkbenchTabsComponent} from './tabs/player-sticker-workbench-tabs.component';
import {PlayerBoardEditorComponent} from './board-editor/player-board-editor.component';
import {StickerCreatorComponent} from './creator/sticker-creator.component';
import {PlayerStickerLibraryComponent} from './library/player-sticker-library.component';
import {LobbyProfileSubmit, ProfileComponent} from '../profile/profile.component';
import {StickerCreatorResult} from './creator/shared/sticker-creator-types';
import {preloadAssetUrlsInBatches} from '../../../core/assets/asset-url-cache';
import {SessionRuntimeService} from '../../../core/runtime/session-runtime.service';
import {buildStaticBoardExportZip} from '../../board-screen/export/board-static-export';
import {type BoardActionButtonState} from '../../../shared/stickers/board-actions/board-action-button.component';
import type {BoardPoint} from '../../../shared/stickers/board-viewport/geometry/sticker-board-types';

type PlayerMode = PlayerStickerSpaceMode;

@Component({
  selector: "app-sticker-workbench",
  standalone: true,
  imports: [CommonModule, PlayerBoardEditorComponent, StickerCreatorComponent, PlayerStickerWorkbenchTabsComponent, PlayerStickerLibraryComponent, ProfileComponent],
  templateUrl: "./sticker-workbench.component.html",
  host: {"class": "h-full flex flex-col"},
})
export class StickerWorkbenchComponent {
  readonly sessionId = input<string | null>(null);
  readonly playerId = input<string>("");
  readonly players = input<Record<string, SessionPlayer>>({});
  readonly stickers = input<PlayerSticker[]>([]);
  readonly defaultStickerCatalog = input<StickerDefinition[]>([]);
  readonly defaultStickerPacks = input<StickerPack[]>([]);
  readonly stickerPacks = input<StickerPack[]>([]);
  readonly editableStickerPacks = input<StickerPack[]>([]);
  readonly editableDefaultPackId = input<string | null>(null);
  readonly boardPlacements = input<BoardStickerPlacement[]>([]);
  readonly createStatus = input<"idle" | "saving" | "saved" | "error">("idle");
  readonly initialProfileName = input("");
  readonly initialProfileAvatarImage = input<string | null>(null);
  readonly initialMode = input<PlayerMode>("board");
  readonly profileEnabled = input(true);

  readonly profileSubmitted = output<LobbyProfileSubmit>();
  readonly createPackRequested = output<string>();
  readonly createSticker = output<StickerCreatorResult>();
  readonly updateSticker = output<{stickerId: string; dataUrl: string; name: string; packId?: string}>();
  readonly moveStickerToPackRequested = output<{stickerId: string; packId: string}>();
  readonly deletePackRequested = output<string>();
  readonly deleteSticker = output<{ stickerId: string }>();
  readonly upsertBoardPlacements = output<BoardStickerPlacement[]>();
  readonly deleteBoardPlacements = output<string[]>();
  readonly boardFocusChanged = output<BoardPoint>();

  readonly mode = signal<PlayerMode>("board");
  readonly stickerToImprove = signal<string | null>(null);
  readonly stickerToEdit = signal<PlayerSticker | null>(null);
  readonly boardExportState = signal<BoardActionButtonState>("idle");
  readonly boardResetState = signal<BoardActionButtonState>("idle");
  readonly storageEstimate = signal<{usage: number; quota: number; percent: number} | null>(null);
  readonly ownStickers = computed(() =>
    this.stickers().filter(sticker => sticker.ownerPlayerId === this.playerId())
  );
  readonly effectiveStickerPacks = computed(() => {
    const explicitPacks = this.stickerPacks();
    return explicitPacks.length > 0 ? explicitPacks : this.defaultStickerPacks();
  });
  readonly effectiveEditableStickerPacks = computed(() => {
    const explicitPacks = this.editableStickerPacks();
    return explicitPacks.length > 0 ? explicitPacks : this.effectiveStickerPacks();
  });
  readonly creatorVisible = computed(() => this.mode() === "create" || (this.mode() === "edit" && !!this.stickerToImprove()));
  readonly creatorEditorOnly = computed(() => this.mode() === "edit");
  readonly currentPlayer = computed(() => this.players()[this.playerId()] ?? null);
  readonly profileInitialName = computed(() => this.currentPlayer()?.name?.trim() || this.initialProfileName());
  readonly profileInitialAvatarImage = computed(() => this.currentPlayer()?.avatarUrl ?? this.initialProfileAvatarImage());
  private readonly sessionRuntime = inject(SessionRuntimeService);
  private initialModeApplied = false;
  private preloadedManifestSessionId: string | null = null;
  private preloadedStateSignature = "";

  constructor() {
    effect(() => {
      const initialMode = this.initialMode();
      if (this.initialModeApplied) return;
      this.initialModeApplied = true;
      this.resetStickerEditorSelection();
      this.mode.set(initialMode);
    });
    effect(() => {
      const sessionId = this.sessionId();
      if (!sessionId || this.preloadedManifestSessionId === sessionId) return;
      this.preloadedManifestSessionId = sessionId;
      void this.preloadStickerManifest(sessionId);
    });
    effect(() => {
      this.sessionId();
      if (this.isLocalBackupSupported()) {
        void this.loadStorageEstimate();
      }
    });
    effect(() => {
      const stickerUrls = [
        ...this.defaultStickerCatalog().map(sticker => sticker.imageUrl),
        ...this.stickers().map(sticker => sticker.imageUrl),
      ];
      const avatarUrls = Object.values(this.players()).map(player => player.avatarUrl);
      const urls = [...stickerUrls, ...avatarUrls];
      const signature = urls.filter(Boolean).join("|");
      if (this.preloadedStateSignature === signature) return;
      this.preloadedStateSignature = signature;
      void preloadAssetUrlsInBatches(urls, {batchSize: 6});
    });
  }

  onCreateSticker(event: StickerCreatorResult): void {
    const editSticker = this.stickerToEdit();
    if (this.mode() === "edit" && editSticker) {
      this.updateSticker.emit({stickerId: editSticker.id, dataUrl: event.dataUrl, name: event.name, packId: editSticker.packId});
      return;
    }

    this.createSticker.emit(event);
  }

  onCreatePackRequested(name: string): void {
    this.createPackRequested.emit(name);
  }

  onDeletePackRequested(packId: string): void {
    this.deletePackRequested.emit(packId);
  }

  editProfile(): void {
    if (!this.profileEnabled()) return;
    this.resetStickerEditorSelection();
    this.mode.set("profile");
  }

  onProfileSubmitted(event: LobbyProfileSubmit): void {
    this.profileSubmitted.emit(event);
    this.mode.set("board");
  }

  onStickerCreated(): void {
    this.resetStickerEditorSelection();
    this.mode.set("board");
  }

  onEditorCanceled(): void {
    this.stickerToEdit.set(null);
    this.stickerToImprove.set(null);
    this.mode.set("edit");
  }

  onImproveSticker(dataUrl: string): void {
    this.stickerToEdit.set(null);
    this.stickerToImprove.set(dataUrl);
    this.mode.set("edit");
  }

  setMode(mode: PlayerMode): void {
    if (mode === "profile" && !this.profileEnabled()) return;
    if (mode !== "edit" || this.mode() !== "edit") {
      this.resetStickerEditorSelection();
    }
    this.mode.set(mode);
  }

  editOwnSticker(sticker: PlayerSticker): void {
    this.stickerToEdit.set(sticker);
    this.stickerToImprove.set(sticker.imageUrl);
    this.mode.set("edit");
  }

  deleteOwnSticker(sticker: PlayerSticker): void {
    if (this.stickerToEdit()?.id === sticker.id) {
      this.stickerToEdit.set(null);
      this.stickerToImprove.set(null);
    }
    this.deleteSticker.emit({stickerId: sticker.id});
  }

  moveOwnStickerToPack(event: {stickerId: string; packId: string}): void {
    this.moveStickerToPackRequested.emit(event);
  }

  onUpsertBoardPlacements(placements: BoardStickerPlacement[]): void {
    this.upsertBoardPlacements.emit(placements);
  }

  onDeleteBoardPlacements(instanceIds: string[]): void {
    this.deleteBoardPlacements.emit(instanceIds);
  }

  onBoardFocusChanged(point: BoardPoint): void {
    this.boardFocusChanged.emit(point);
  }

  isLocalBackupSupported(): boolean {
    return this.sessionRuntime.isLocalBackupSupported();
  }

  isStorageNearlyFull(): boolean {
    return (this.storageEstimate()?.percent ?? 0) >= 0.8;
  }

  storageUsageLabel(): string {
    const estimate = this.storageEstimate();
    if (!estimate) return "";
    return `${this.formatBytes(estimate.usage)} / ${this.formatBytes(estimate.quota)}`;
  }

  async exportLocalBoard(event: Event): Promise<void> {
    event.stopPropagation();
    const sessionId = this.sessionId();
    if (!sessionId || this.boardExportState() === "loading") return;

    this.boardExportState.set("loading");
    try {
      const [state, sessionAssets] = await Promise.all([
        this.sessionRuntime.getSessionState(sessionId),
        this.sessionRuntime.getSessionAssets(sessionId),
      ]);
      const blob = await buildStaticBoardExportZip({state, sessionCode: state.sessionCode, sessionAssets});
      this.downloadBlob(blob, `stickermania-board-${state.sessionCode}.zip`);
      this.boardExportState.set("done");
      await this.loadStorageEstimate();
      window.setTimeout(() => this.boardExportState.set("idle"), 1800);
    } catch {
      this.boardExportState.set("error");
      window.setTimeout(() => this.boardExportState.set("idle"), 2400);
    }
  }

  resetLocalBoard(event: Event): void {
    event.stopPropagation();
    if (this.boardResetState() === "loading") {
      return;
    }

    const placementIds = this.boardPlacements().map(placement => placement.instanceId);
    if (placementIds.length === 0) {
      this.boardResetState.set("done");
      window.setTimeout(() => this.boardResetState.set("idle"), 1200);
      return;
    }

    if (!window.confirm("Alle platzierten Sticker vom Board entfernen? Hochgeladene Sticker bleiben erhalten.")) {
      return;
    }

    this.boardResetState.set("loading");
    this.deleteBoardPlacements.emit(placementIds);
    this.boardResetState.set("done");
    window.setTimeout(() => this.boardResetState.set("idle"), 1800);
    window.setTimeout(() => void this.loadStorageEstimate(), 300);
  }

  private resetStickerEditorSelection(): void {
    this.stickerToEdit.set(null);
    this.stickerToImprove.set(null);
  }

  private async preloadStickerManifest(sessionId: string): Promise<void> {
    try {
      const manifest = await this.sessionRuntime.getStickerManifest(sessionId);
      await preloadAssetUrlsInBatches(manifest.stickers.map(sticker => sticker.imageUrl), {batchSize: 6});
    } catch {
      // The reactive state preload remains as fallback if the manifest request races a session change.
    }
  }

  private async loadStorageEstimate(): Promise<void> {
    if (!this.isLocalBackupSupported() || !navigator.storage?.estimate) {
      this.storageEstimate.set(null);
      return;
    }
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      this.storageEstimate.set({
        usage,
        quota,
        percent: quota > 0 ? usage / quota : 0,
      });
    } catch {
      this.storageEstimate.set(null);
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
  }

}
