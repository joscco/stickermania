import {CommonModule} from "@angular/common";
import {Component, computed, input, OnDestroy, output, signal, ViewChild} from "@angular/core";
import type {PlayerSticker, StickerPack} from "@birthday/shared";
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
import {AnimOnInitDirective} from '../../../../shared/ui/animations/anim-on-init.directive';
import {ScrollViewportComponent} from '../../../../shared/ui/scroll-viewport/scroll-viewport.component';
import {StickerImgComponent} from '../../../../shared/stickers/primitives/sticker-img/sticker-img.component';
import {SvgComponent} from '../../../../shared/ui/svg/svg.component';
import {
  PressDragController,
  type PressDragSnapshot,
} from "../../../../shared/input/press-drag.controller";
import type {PointerInteractionSnapshot} from '../../../../shared/input/pointer-interaction-registrar';
import {
  buildOwnStickerPacks,
  buildStickerPackSections,
  playerDefaultPackId,
} from "./player-sticker-library.model";
import {
  PlayerStickerLibraryCommandService,
  type PlayerStickerLibraryCommand,
} from "./player-sticker-library.commands";

type StickerDragPreviewPhase = "spawn" | "holding" | "dragging";


type StickerDragPreview = {
  sticker: PlayerSticker;
  clientX: number;
  clientY: number;
  size: number;
  phase: StickerDragPreviewPhase;
};

@Component({
  selector: "app-player-sticker-library",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, ScrollViewportComponent, StickerImgComponent, SvgComponent],
  templateUrl: "./player-sticker-library.component.html",
})
export class PlayerStickerLibraryComponent implements OnDestroy {
  readonly playerId = input<string>("");
  readonly defaultPackIdOverride = input<string | null>(null);
  readonly stickers = input<PlayerSticker[]>([]);
  readonly stickerPacks = input<StickerPack[]>([]);

  readonly stickerSelected = output<PlayerSticker>();
  readonly stickerDeleted = output<PlayerSticker>();
  readonly stickerPackChanged = output<{ stickerId: string; packId: string }>();
  readonly createPackRequested = output<string>();
  readonly deletePackRequested = output<string>();

  readonly pressedStickerId = signal<string | null>(null);
  readonly draggingStickerId = signal<string | null>(null);
  readonly dragOverPackId = signal<string | null>(null);
  readonly dragPreview = signal<StickerDragPreview | null>(null);
  readonly newPackName = signal("");

  @ViewChild(ScrollViewportComponent)
  private scrollViewport?: ScrollViewportComponent;

  private previewAnimationFrameId: number | null = null;

  private readonly dragPreviewSize = STICKERMANIA_CONFIG.stickers.dragPreviewSizePx;

  private readonly commandService = new PlayerStickerLibraryCommandService(command => this.executeLibraryCommand(command));

  private readonly stickerDragController = new PressDragController<PlayerSticker>({
    dragThresholdPx: snapshot => {
      switch (snapshot.event.pointerType) {
        case "touch":
        case "pen": {
          return 18;
        }
        case "mouse":
        default: {
          return 8;
        }
      }
    },
    holdDelayMs: 90,
    suppressClickMs: 80,
    contextKey: sticker => sticker.id,
    requireHoldBeforeDrag: snapshot => snapshot.event.pointerType === "touch",
    onPressStart: snapshot => this.handleStickerPressStart(snapshot),
    onPressMove: snapshot => this.handleStickerPressMove(snapshot),
    onHold: snapshot => this.handleStickerHold(snapshot),
    onDragStart: snapshot => this.handleStickerDragStart(snapshot),
    onDragMove: snapshot => this.handleStickerDragMove(snapshot),
    onDrop: snapshot => this.handleStickerDrop(snapshot),
    onCancel: () => this.cleanupDragUi(),
  });

  readonly defaultPackId = computed(() => this.defaultPackIdOverride() ?? playerDefaultPackId(this.playerId()));

  readonly ownStickerPacks = computed<StickerPack[]>(() => buildOwnStickerPacks({
    playerId: this.playerId(),
    defaultPackId: this.defaultPackId(),
    stickerPacks: this.stickerPacks(),
  }));

  readonly packSections = computed(() => buildStickerPackSections({
    stickers: this.stickers(),
    ownStickerPacks: this.ownStickerPacks(),
    defaultPackId: this.defaultPackId(),
  }));

  readonly contentVersion = computed(() =>
    this.stickers().length + this.ownStickerPacks().length + this.stickers().filter(sticker => sticker.packId).length,
  );

  ngOnDestroy(): void {
    this.stickerDragController.dispose();
    this.cleanupDragUi();
  }

  updateNewPackName(name: string): void {
    this.newPackName.set(name.slice(0, STICKERMANIA_CONFIG.stickerPacks.maxNameLength));
  }

  requestPackCreate(): void {
    if (this.commandService.requestCreatePack(this.newPackName())) {
      this.newPackName.set("");
    }
  }

  requestPackDelete(packId: string): void {
    this.commandService.requestDeletePack({
      packId,
      defaultPackId: this.defaultPackId(),
    });
  }

  onStickerPointerDown(event: PointerEvent, sticker: PlayerSticker): void {
    if (!this.isStickerDragHandle(event.target)) {
      return;
    }

    this.stickerDragController.start(event, sticker);
  }

  onStickerClick(event: MouseEvent, sticker: PlayerSticker): void {
    if (this.stickerDragController.shouldSuppressClick(sticker)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.commandService.selectSticker(sticker);
  }

  deleteSticker(sticker: PlayerSticker): void {
    this.commandService.deleteSticker(sticker);
  }

  private isStickerDragHandle(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest("[data-sticker-drag-handle]");
  }

  private handleStickerPressStart(snapshot: PointerInteractionSnapshot<PlayerSticker>): void {
    this.pressedStickerId.set(snapshot.context.id);
  }

  private handleStickerPressMove(snapshot: PointerInteractionSnapshot<PlayerSticker>): void {
    this.updateExistingDragPreviewPosition(
      snapshot.point.clientX,
      snapshot.point.clientY,
      "holding",
    );
  }

  private handleStickerHold(snapshot: PointerInteractionSnapshot<PlayerSticker>): void {
    this.showDragPreview(
      snapshot.context,
      snapshot.point.clientX,
      snapshot.point.clientY,
      "holding",
    );
  }

  private handleStickerDragStart(snapshot: PointerInteractionSnapshot<PlayerSticker>): void {
    this.draggingStickerId.set(snapshot.context.id);
  }

  private handleStickerDragMove(snapshot: PointerInteractionSnapshot<PlayerSticker>): void {
    this.showDragPreview(
      snapshot.context,
      snapshot.point.clientX,
      snapshot.point.clientY,
      "dragging",
    );

    const packId = this.findPackIdAtClientPoint(snapshot.point.clientX, snapshot.point.clientY);
    this.dragOverPackId.set(packId);

    this.scrollViewport?.autoScrollForClientY(snapshot.point.clientY);
  }

  private handleStickerDrop(snapshot: PressDragSnapshot<PlayerSticker>): void {
    const targetPackId = this.dragOverPackId()
      ?? this.findPackIdAtClientPoint(snapshot.point.clientX, snapshot.point.clientY);

    this.cleanupDragUi();

    this.commandService.moveStickerToPackAfterDrop({
      sticker: snapshot.context,
      targetPackId,
      wasDragging: snapshot.wasDragging,
      ownPackIds: new Set(this.ownStickerPacks().map(pack => pack.id)),
      defaultPackId: this.defaultPackId(),
    });
  }

  private cleanupDragUi(): void {
    this.cancelPreviewAnimationFrame();

    this.pressedStickerId.set(null);
    this.draggingStickerId.set(null);
    this.dragOverPackId.set(null);
    this.dragPreview.set(null);
    this.scrollViewport?.stopAutoScroll();
  }

  onNativeDragStart(event: DragEvent): void {
    event.preventDefault();
  }

  dragPreviewTransform(preview: StickerDragPreview): string {
    switch (preview.phase) {
      case "spawn":
        return "translate3d(-50%, -50%, 0) scale(0.68) rotate(-4deg)";
      case "holding":
        return "translate3d(-50%, -54%, 0) scale(0.92) rotate(-2deg)";
      case "dragging":
        return "translate3d(-50%, -58%, 0) scale(1.08) rotate(4deg)";
    }
  }

  private showDragPreview(
    sticker: PlayerSticker,
    clientX: number,
    clientY: number,
    phase: StickerDragPreviewPhase,
  ): void {
    const currentPreview = this.dragPreview();

    if (!currentPreview || currentPreview.sticker.id !== sticker.id) {
      this.dragPreview.set({
        sticker,
        clientX,
        clientY,
        size: this.dragPreviewSize,
        phase: "spawn",
      });

      this.schedulePreviewPhase(phase);
      return;
    }

    this.cancelPreviewAnimationFrame();

    this.dragPreview.set({
      ...currentPreview,
      clientX,
      clientY,
      phase,
    });
  }

  private updateExistingDragPreviewPosition(
    clientX: number,
    clientY: number,
    phase: StickerDragPreviewPhase,
  ): void {
    const currentPreview = this.dragPreview();

    if (!currentPreview) {
      return;
    }

    this.dragPreview.set({
      ...currentPreview,
      clientX,
      clientY,
      phase,
    });
  }

  private schedulePreviewPhase(phase: StickerDragPreviewPhase): void {
    this.cancelPreviewAnimationFrame();

    this.previewAnimationFrameId = window.requestAnimationFrame(() => {
      this.previewAnimationFrameId = null;

      const currentPreview = this.dragPreview();

      if (!currentPreview) {
        return;
      }

      this.dragPreview.set({
        ...currentPreview,
        phase,
      });
    });
  }

  private cancelPreviewAnimationFrame(): void {
    if (this.previewAnimationFrameId === null) {
      return;
    }

    window.cancelAnimationFrame(this.previewAnimationFrameId);
    this.previewAnimationFrameId = null;
  }

  private findPackIdAtClientPoint(clientX: number, clientY: number): string | null {
    const element = document.elementFromPoint(clientX, clientY);
    const packElement = element?.closest<HTMLElement>("[data-sticker-pack-drop-zone]");
    return packElement?.dataset["packId"] ?? null;
  }

  private executeLibraryCommand(command: PlayerStickerLibraryCommand): void {
    switch (command.type) {
      case "selectSticker": {
        this.stickerSelected.emit(command.sticker);
        break;
      }
      case "deleteSticker": {
        this.stickerDeleted.emit(command.sticker);
        break;
      }
      case "createPack": {
        this.createPackRequested.emit(command.name);
        break;
      }
      case "deletePack": {
        this.deletePackRequested.emit(command.packId);
        break;
      }
      case "moveStickerToPack": {
        this.stickerPackChanged.emit({
          stickerId: command.stickerId,
          packId: command.packId,
        });
        break;
      }
    }
  }

}
