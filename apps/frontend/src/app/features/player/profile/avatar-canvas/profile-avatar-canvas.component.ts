import {AfterViewInit, Component, effect, ElementRef, input, OnDestroy, output, signal, ViewChild} from "@angular/core";
import {cachedAssetUrl} from "../../../../core/assets/asset-url-cache";
import {applyDirectManipulationStyles, installSafariGestureGuards} from "../../../../shared/input/pointer-event-utils";
import {STICKERMANIA_COLORS} from "../../../../shared/theme/stickermania-theme";
import {AvatarCanvasPainter} from "./avatar-canvas-painter";

export type ProfileAvatarDrawMode = "paint" | "erase";

@Component({
  selector: "app-profile-avatar-canvas",
  standalone: true,
  templateUrl: "./profile-avatar-canvas.component.html",
  host: {"style": "display: block"},
})
export class ProfileAvatarCanvasComponent implements AfterViewInit, OnDestroy {
  readonly submitted = output<string>();
  readonly cleared = output<void>();
  readonly changed = output<void>();
  readonly initialImage = input<string | null>(null);
  readonly drawMode = input<ProfileAvatarDrawMode>("paint");

  @ViewChild("drawCanvas") private canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild("wrapper") private wrapperRef!: ElementRef<HTMLElement>;

  private readonly canvasReady = signal(false);
  private loadedInitialImage: string | null | undefined = undefined;
  private removeGestureGuards: (() => void) | null = null;
  readonly painter = new AvatarCanvasPainter(
    () => this.canvasRef?.nativeElement,
    () => (this.drawMode() === "erase" ? STICKERMANIA_COLORS.white : STICKERMANIA_COLORS.inkHard),
    () => (this.drawMode() === "erase" ? 20 : 10),
  );

  constructor() {
    effect(() => {
      const image = this.initialImage();
      if (!this.canvasReady() || image === this.loadedInitialImage) {
        return;
      }

      this.loadedInitialImage = image;
      if (image) {
        void cachedAssetUrl(image).then((resolvedImage) => {
          if (this.loadedInitialImage !== image) return;
          this.painter.loadImage(resolvedImage);
        });
      } else {
        this.painter.clear();
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.painter.init();
      this.canvasReady.set(true);
    }, 50);

    const wrapper = this.wrapperRef?.nativeElement;
    const canvas = this.canvasRef?.nativeElement;

    if (wrapper) {
      applyDirectManipulationStyles(wrapper);
      this.removeGestureGuards = installSafariGestureGuards(wrapper);
    }
    if (canvas) {
      applyDirectManipulationStyles(canvas);
    }
  }

  ngOnDestroy(): void {
    this.removeGestureGuards?.();
  }

  clear(): void {
    this.painter.clear();
    this.cleared.emit();
  }

  onPointerDown(event: PointerEvent): void {
    if (this.painter.pointerDown(event)) {
      this.changed.emit();
    }
  }

  submit(): void {
    const dataUrl = this.painter.toDataURL();
    if (dataUrl) {
      this.submitted.emit(dataUrl);
    }
  }
}
