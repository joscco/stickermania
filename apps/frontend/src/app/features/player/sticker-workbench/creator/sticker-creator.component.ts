import {Component, input, output, signal} from "@angular/core";
import type {PlayerSticker, StickerEditorData} from "@birthday/shared";
import {StickerCreatorStartComponent} from './start/sticker-creator-start.component';
import {StickerCreatorCropComponent} from './crop/sticker-creator-crop.component';
import {StickerCreatorPaintComponent} from './paint/sticker-creator-paint.component';
import {StickerCreatorResult} from './shared/sticker-creator-types';

@Component({
  selector: "app-sticker-creator",
  standalone: true,
  imports: [StickerCreatorStartComponent, StickerCreatorCropComponent, StickerCreatorPaintComponent],
  templateUrl: "./sticker-creator.component.html",
})
export class StickerCreatorComponent {
  readonly stickers = input<PlayerSticker[]>([]);
  readonly playerId = input<string>("");
  readonly createStatus = input<"idle" | "saving" | "saved" | "error">("idle");
  readonly editorOnly = input(false);
  readonly initialStickerDataUrl = input<string | null>(null);
  readonly initialStickerName = input<string | null>(null);
  readonly editingStickerId = input<string | null>(null);
  readonly initialStickerEditorData = input<StickerEditorData | null>(null);

  readonly createSticker = output<StickerCreatorResult>();
  readonly improveSticker = output<string>();
  readonly stickerCreated = output<void>();
  readonly editorCanceled = output<void>();

  readonly sourceImageDataUrl = signal<string | null>(null);
  readonly blankPaintActive = signal(false);

  startImageCrop(dataUrl: string): void {
    this.sourceImageDataUrl.set(dataUrl);
    this.blankPaintActive.set(false);
  }

  startBlankPaint(): void {
    this.sourceImageDataUrl.set(null);
    this.blankPaintActive.set(true);
  }

  resetToStart(): void {
    this.sourceImageDataUrl.set(null);
    this.blankPaintActive.set(false);
  }

  forwardImproveSticker(dataUrl: string): void {
    this.improveSticker.emit(dataUrl);
    this.resetToStart();
  }

  onPaintCanceled(): void {
    if (this.editorOnly()) {
      this.editorCanceled.emit();
      return;
    }
    this.resetToStart();
  }

  onStickerCreated(): void {
    this.resetToStart();
    this.stickerCreated.emit();
  }
}
