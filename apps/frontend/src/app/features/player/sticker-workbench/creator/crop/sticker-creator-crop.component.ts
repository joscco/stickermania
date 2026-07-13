import {CommonModule} from "@angular/common";
import {AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, effect, input, output, signal} from "@angular/core";
import {SvgComponent} from '../../../../../shared/ui/svg/svg.component';
import {TransformGestureController, type TransformGestureEvent} from '../../../../../shared/input/transform-gesture.controller';
import {PointerSurfaceDirective} from '../../../../../shared/input/pointer-surface.directive';
import {CropImageTransformCommandService} from './crop-image-transform.commands';
import {clampCropImageScale, clampCropImageTransform, type CropImageTransformClampOptions} from './crop-image-transform.clamp';
import {CropCanvasRenderer} from './crop-canvas-renderer';
import {CropPreviewRenderer} from './crop-preview-renderer';
import {CropSelectionCommandService} from './crop-selection.commands';
import {CropInteractionController} from './crop-interaction.controller';
import type {CanvasPoint, CropMode, ImageTransform} from './crop-editor.types';
import {CanvasViewportController} from '../../../../../shared/ui/canvas/canvas-viewport.controller';

@Component({
  selector: "app-sticker-creator-crop",
  standalone: true,
  imports: [CommonModule, SvgComponent, PointerSurfaceDirective],
  templateUrl: "./sticker-creator-crop.component.html",
})
export class StickerCreatorCropComponent implements AfterViewInit, OnDestroy {
  readonly imageDataUrl = input.required<string>();

  readonly improveSticker = output<string>();
  readonly canceled = output<void>();

  @ViewChild("canvasFrame") set canvasFrameRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this.canvasViewport.setCanvasFrame(ref);
  }

  @ViewChild("sourceCanvas") set sourceCanvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvasViewport.setSourceCanvas(ref, this.sourceLoaded());
  }

  readonly cropMode = signal<CropMode>("arrange");
  readonly sourceLoaded = signal(false);
  readonly hasSelection = signal(false);
  readonly previewReady = signal(false);
  readonly previewDataUrl = signal<string | null>(null);
  readonly selectedPolygonPointIndex = signal<number | null>(null);

  private sourceImage: HTMLImageElement | null = null;
  private arrangePinchStartTransform: ImageTransform | null = null;
  private imageTransform: ImageTransform = {x: 450, y: 450, scale: 1, rotation: 0};
  private loadedDataUrl: string | null = null;
  private readonly minZoomOutFactor = 0.65;
  private readonly maxImageScale = 10;
  private readonly canvasRenderer = new CropCanvasRenderer();
  private readonly previewRenderer = new CropPreviewRenderer();
  private readonly canvasViewport = new CanvasViewportController({
    fit: () => this.resetImageTransform(),
    onResize: ({previousWidth, previousHeight, width, height}) => {
      if (!this.sourceImage) return;
      this.setImageTransform({
        ...this.imageTransform,
        x: this.imageTransform.x * width / (previousWidth || width),
        y: this.imageTransform.y * height / (previousHeight || height),
      });
    },
    redraw: () => this.redrawSource(),
  });
  private readonly selectionCommandService = new CropSelectionCommandService({
    getMode: () => this.cropMode(),
    getCanvasPixelRatio: () => this.canvasViewport.canvasPixelRatio(),
    getSelectedPolygonPointIndex: () => this.selectedPolygonPointIndex(),
    setSelectedPolygonPointIndex: index => this.selectedPolygonPointIndex.set(index),
    setHasSelection: hasSelection => this.hasSelection.set(hasSelection),
    setPreviewReady: ready => this.previewReady.set(ready),
    setPreviewDataUrl: dataUrl => this.previewDataUrl.set(dataUrl),
    renderPreview: () => this.renderPreview(),
    redraw: () => this.redrawSource(),
  });
  private readonly imageTransformCommandService = new CropImageTransformCommandService({
    getImageTransform: () => this.imageTransform,
    setImageTransform: transform => this.setImageTransform(transform),
    clampScale: scale => this.clampScale(scale),
    redraw: () => this.redrawSource(),
  });
  private readonly arrangeGestureController = new TransformGestureController<CanvasPoint>({
    surface: () => this.canvasViewport.canvas(),
    pointerToPoint: event => this.canvasViewport.canvasPoint(event),
    wheelToPoint: event => this.canvasViewport.canvasPointFromClient(event.clientX, event.clientY),
    onGesture: gesture => this.handleArrangeGesture(gesture),
    preventDefault: true,
    capturePointers: true,
  });
  readonly cropInteractionController = new CropInteractionController({
    isSourceLoaded: () => this.sourceLoaded(),
    cropMode: () => this.cropMode(),
    surface: () => this.canvasViewport.canvas(),
    toCanvasPoint: event => this.canvasViewport.canvasPoint(event),
    arrangeGestureController: this.arrangeGestureController,
    selectionCommandService: this.selectionCommandService,
  });

  constructor() {
    effect(() => {
      const dataUrl = this.imageDataUrl();

      if (dataUrl === this.loadedDataUrl) {
        return;
      }

      this.loadedDataUrl = dataUrl;
      this.loadSourceImage(dataUrl);
    });
  }

  ngAfterViewInit(): void {
    this.canvasViewport.scheduleRender(this.sourceLoaded());
  }

  ngOnDestroy(): void {
    this.cropInteractionController.dispose();
    this.arrangeGestureController.dispose();
    this.canvasViewport.dispose();
  }

  toggleLassoMode(): void {
    this.setCropMode(this.cropMode() === "lasso" ? "arrange" : "lasso");
  }

  togglePolygonLassoMode(): void {
    const nextMode = this.cropMode() === "polygon-lasso" ? "arrange" : "polygon-lasso";

    this.setCropMode(nextMode);

    if (nextMode === "polygon-lasso") {
      this.redrawSource();
    }
  }

  resetImageTransform(): void {
    const canvas = this.canvasViewport.canvas();
    const image = this.sourceImage;
    const canvasWidth = canvas?.width ?? 900;
    const canvasHeight = canvas?.height ?? 900;

    if (!image) {
      this.imageTransform = {x: canvasWidth / 2, y: canvasHeight / 2, scale: 1, rotation: 0};
      return;
    }

    this.setImageTransform({
      x: canvasWidth / 2,
      y: canvasHeight / 2,
      scale: Math.min(canvasWidth / image.width, canvasHeight / image.height),
      rotation: 0,
    });

    this.resetSelection();
    this.redrawSource();
  }

  requestStickerImprovement(): void {
    if (!this.previewReady() && this.cropMode() === "polygon-lasso" && this.canFinishPolygonSelection()) {
      this.finishPolygonSelection();
    }

    if (!this.previewReady() && this.cropMode() === "arrange") {
      this.renderFullImagePreview();
    }

    const dataUrl = this.previewDataUrl();

    if (!dataUrl) {
      return;
    }

    this.improveSticker.emit(dataUrl);
  }

  canRequestStickerImprovement(): boolean {
    if (this.previewReady()) {
      return true;
    }

    if (this.cropMode() === "arrange") {
      return this.sourceLoaded();
    }

    return this.cropMode() === "polygon-lasso" && this.canFinishPolygonSelection();
  }

  cancelStickerCreation(): void {
    this.sourceImage = null;
    this.sourceLoaded.set(false);
    this.setCropMode("arrange");
    this.resetSelection();
    this.redrawSource();
    this.canceled.emit();
  }

  deleteSelectedPolygonPoint(): void {
    this.selectionCommandService.deleteSelectedPolygonPoint();
  }

  selectedPolygonPointLeftPx(): number {
    const position = this.selectedPolygonPointCssPosition();
    return position?.x ?? 0;
  }

  selectedPolygonPointTopPx(): number {
    const position = this.selectedPolygonPointCssPosition();
    return position?.y ?? 0;
  }

  private loadSourceImage(dataUrl: string): void {
    const image = new Image();

    image.onload = () => {
      this.sourceImage = image;
      this.setCropMode("arrange");
      this.resetSelection();
      this.sourceLoaded.set(true);
      this.canvasViewport.scheduleRender(true);
    };

    image.src = dataUrl;
  }

  private resetSelection(): void {
    this.selectionCommandService.reset();
    this.cropInteractionController.cancel();
    this.arrangePinchStartTransform = null;
  }

  private setCropMode(mode: CropMode): void {
    this.cropMode.set(mode);
    this.cropInteractionController.cancel();
    this.arrangePinchStartTransform = null;
    this.selectionCommandService.prepareForMode(mode);
  }

  private finishPolygonSelection(): void {
    this.selectionCommandService.finishPolygonSelection();
  }

  private canFinishPolygonSelection(): boolean {
    return this.selectionCommandService.canFinishPolygonSelection();
  }

  private redrawSource(): void {
    const canvas = this.canvasViewport.canvas();

    if (!canvas) {
      return;
    }

    this.canvasRenderer.render({
      canvas,
      sourceImage: this.sourceImage,
      imageTransform: this.imageTransform,
      lassoPath: this.selectionCommandService.path(),
      cropMode: this.cropMode(),
      selectedPolygonPointIndex: this.selectedPolygonPointIndex(),
      canvasPixelRatio: this.canvasViewport.canvasPixelRatio(),
    });
  }

  private renderPreview(): void {
    const sourceCanvas = this.canvasViewport.canvas();
    const sourceImage = this.sourceImage;

    if (!sourceCanvas || !sourceImage) {
      return;
    }

    const previewDataUrl = this.previewRenderer.renderSelectionPreview({
      sourceCanvas,
      sourceImage,
      imageTransform: this.imageTransform,
      lassoPath: this.selectionCommandService.path(),
    });

    if (!previewDataUrl) {
      return;
    }

    this.previewDataUrl.set(previewDataUrl);
    this.previewReady.set(true);
    this.redrawSource();
  }

  private renderFullImagePreview(): void {
    const sourceImage = this.sourceImage;

    if (!sourceImage) {
      return;
    }

    const previewDataUrl = this.previewRenderer.renderFullImagePreview({
      sourceImage,
      imageTransform: this.imageTransform,
    });

    if (!previewDataUrl) {
      return;
    }

    this.previewDataUrl.set(previewDataUrl);
    this.previewReady.set(true);
    this.redrawSource();
  }

  private selectedPolygonPointCssPosition(): CanvasPoint | null {
    return this.selectionCommandService.selectedPolygonPointCssPosition(this.canvasViewport.canvas());
  }

  private handleArrangeGesture(gesture: TransformGestureEvent<CanvasPoint>): void {
    switch (gesture.type) {
      case "panMove": {
        this.imageTransformCommandService.execute({
          type: "panImage",
          deltaX: gesture.deltaX,
          deltaY: gesture.deltaY,
        });
        break;
      }

      case "pinchStart": {
        this.arrangePinchStartTransform = {...this.imageTransform};
        break;
      }

      case "pinchMove": {
        const startTransform = this.arrangePinchStartTransform;

        if (!startTransform) {
          return;
        }

        this.imageTransformCommandService.execute({
          type: "pinchImage",
          startTransform,
          startCenter: gesture.start.center,
          currentCenter: gesture.current.center,
          scaleFactor: gesture.scaleFactor,
        });
        break;
      }

      case "pinchEnd": {
        this.arrangePinchStartTransform = null;
        break;
      }

      case "wheelZoom": {
        this.imageTransformCommandService.execute({
          type: "zoomImage",
          point: gesture.point,
          factor: gesture.factor,
        });
        break;
      }

      case "panStart":
      case "panEnd": {
        break;
      }
    }
  }

  private setImageTransform(transform: ImageTransform): void {
    this.imageTransform = this.clampImageTransform(transform);
  }

  private clampScale(scale: number): number {
    return clampCropImageScale(scale, this.cropImageClampOptions());
  }

  private clampImageTransform(transform: ImageTransform): ImageTransform {
    return clampCropImageTransform(transform, this.cropImageClampOptions());
  }

  private cropImageClampOptions(): CropImageTransformClampOptions {
    return {
      canvas: this.canvasViewport.canvas(),
      image: this.sourceImage,
      minZoomOutFactor: this.minZoomOutFactor,
      maxImageScale: this.maxImageScale,
    };
  }
}
