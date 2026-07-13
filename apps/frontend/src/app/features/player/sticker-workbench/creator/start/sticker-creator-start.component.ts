import {Component, OnDestroy, OnInit, inject, output, signal} from "@angular/core";
import {StickerCreatorStartActionComponent} from "./sticker-creator-start-action.component";
import {AnimGroupDirective, AnimOnInitDirective} from '../../../../../shared/ui/animations/anim-on-init.directive';
import {RealtimeRuntimeService} from '../../../../../core/runtime/realtime-runtime.service';

type CameraAvailability = "unknown" | "available" | "unavailable";
const IMPORT_IMAGE_MAX_SIDE = 2048;
const IMPORT_IMAGE_JPEG_QUALITY = 0.9;
const EXTERNAL_PICKER_CLEAR_DELAY_MS = 20_000;

@Component({
  selector: "app-sticker-creator-start",
  standalone: true,
  templateUrl: "./sticker-creator-start.component.html",
  imports: [
    AnimGroupDirective,
    AnimOnInitDirective,
    StickerCreatorStartActionComponent,
  ]
})
export class StickerCreatorStartComponent implements OnInit, OnDestroy {
  private readonly realtime = inject(RealtimeRuntimeService);

  readonly imageSelected = output<string>();
  readonly blankSelected = output<void>();
  readonly cameraAvailability = signal<CameraAvailability>("unknown");
  private pickerClearTimer: ReturnType<typeof setTimeout> | null = null;
  private removePickerListeners: (() => void) | null = null;
  private imagePickInProgress = false;

  ngOnInit(): void {
    void this.detectCameraAvailability();
  }

  async onFileSelected(file: File | null): Promise<void> {
    if (!file) {
      this.endExternalImagePick();
      return;
    }

    this.imagePickInProgress = true;
    try {
      this.imageSelected.emit(await this.prepareImageForCrop(file));
    } catch {
      // Keep the picker failure silent for now; the user stays on the start screen.
    } finally {
      this.imagePickInProgress = false;
      this.endExternalImagePick();
    }
  }

  beginExternalImagePick(): void {
    this.realtime.setExternalPickerActive(true);
    if (this.pickerClearTimer) {
      clearTimeout(this.pickerClearTimer);
      this.pickerClearTimer = null;
    }
    this.removePickerListeners?.();

    const scheduleClear = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      if (this.pickerClearTimer) clearTimeout(this.pickerClearTimer);
      this.pickerClearTimer = setTimeout(() => {
        if (this.imagePickInProgress) return;
        this.endExternalImagePick();
      }, EXTERNAL_PICKER_CLEAR_DELAY_MS);
    };
    window.addEventListener("focus", scheduleClear);
    window.addEventListener("pageshow", scheduleClear);
    document.addEventListener("visibilitychange", scheduleClear);
    this.removePickerListeners = () => {
      window.removeEventListener("focus", scheduleClear);
      window.removeEventListener("pageshow", scheduleClear);
      document.removeEventListener("visibilitychange", scheduleClear);
      this.removePickerListeners = null;
    };
  }

  ngOnDestroy(): void {
    this.endExternalImagePick();
  }

  private endExternalImagePick(): void {
    if (this.pickerClearTimer) {
      clearTimeout(this.pickerClearTimer);
      this.pickerClearTimer = null;
    }
    this.removePickerListeners?.();
    this.realtime.setExternalPickerActive(false);
  }

  private async prepareImageForCrop(file: File): Promise<string> {
    if (file.type === "image/svg+xml") {
      return this.readFileAsDataUrl(file);
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await this.loadImage(objectUrl);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      const longSide = Math.max(width, height);

      if (longSide <= IMPORT_IMAGE_MAX_SIDE) {
        return this.readFileAsDataUrl(file);
      }

      const scale = IMPORT_IMAGE_MAX_SIDE / longSide;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return this.readFileAsDataUrl(file);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      return mimeType === "image/jpeg"
        ? canvas.toDataURL(mimeType, IMPORT_IMAGE_JPEG_QUALITY)
        : canvas.toDataURL(mimeType);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load selected image"));
      image.src = src;
    });
  }

  private async detectCameraAvailability(): Promise<void> {
    if (!this.supportsLikelyCameraCapture()) {
      this.cameraAvailability.set("unavailable");
      return;
    }

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      this.cameraAvailability.set("available");
      return;
    }

    try {
      const devices = await mediaDevices.enumerateDevices();
      this.cameraAvailability.set(devices.some(device => device.kind === "videoinput") ? "available" : "unavailable");
    } catch {
      this.cameraAvailability.set("available");
    }
  }

  private supportsLikelyCameraCapture(): boolean {
    if (typeof window === "undefined" || typeof navigator === "undefined") return false;

    const userAgent = navigator.userAgent;
    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const iPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    return mobileUserAgent || iPadDesktopMode || (coarsePointer && navigator.maxTouchPoints > 0);
  }
}
