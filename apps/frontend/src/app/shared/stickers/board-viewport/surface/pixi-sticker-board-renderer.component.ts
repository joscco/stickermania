import {CommonModule} from "@angular/common";
import {AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, effect, input, signal} from "@angular/core";
import type {BoardStickerPlacement, StickerDefinition} from "@birthday/shared";
import type {Application, Container, TilingSprite} from "pixi.js";
import type {PlacementBadge} from "../labels/sticker-board-label-layout";
import type {BoardBounds} from "../geometry/sticker-board-types";
import type {StickerAnimState} from "../../primitives/sticker-item/sticker-item.component";
import {PixiBoardCameraLayer} from "./pixi-board-camera-layer";
import {PixiBoardLabelLayer} from "./pixi-board-label-layer";
import {PixiBoardStickerLayer} from "./pixi-board-sticker-layer";
import {PixiBoardTextureStore} from "./pixi-board-texture-store";

const DOT_PATTERN_URL = "/assets/svg/board-dot-pattern.svg";

@Component({
  selector: "app-pixi-sticker-board-renderer",
  standalone: true,
  imports: [CommonModule],
  template: `<div #host class="absolute inset-0 overflow-hidden"></div>`,
  host: {class: "absolute inset-0 z-0 block"},
})
export class PixiStickerBoardRendererComponent implements AfterViewInit, OnDestroy {
  readonly placements = input<BoardStickerPlacement[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly bounds = input.required<BoardBounds>();
  readonly boardWidth = input.required<number>();
  readonly boardHeight = input.required<number>();
  readonly stickerBaseSize = input.required<number>();
  readonly panX = input.required<number>();
  readonly panY = input.required<number>();
  readonly zoom = input.required<number>();
  readonly viewportW = input.required<number>();
  readonly viewportH = input.required<number>();
  readonly stickerShadowOffsetX = input(2);
  readonly stickerShadowOffsetY = input(3);
  readonly showPlacementLabels = input(false);
  readonly placementBadges = input<Record<string, PlacementBadge>>({});
  readonly stickerAnimStates = input<Record<string, StickerAnimState>>({});
  readonly cameraSmoothingMs = input(55);
  readonly maxResolution = input(2);
  readonly warmupFrames = input(2);
  readonly inputElement = signal<HTMLElement | null>(null);

  @ViewChild("host", {static: true}) private host!: ElementRef<HTMLDivElement>;

  private app: Application | null = null;
  private textures: PixiBoardTextureStore | null = null;
  private cameraLayer: PixiBoardCameraLayer | null = null;
  private labelLayer: PixiBoardLabelLayer | null = null;
  private stickerLayer: PixiBoardStickerLayer | null = null;
  private dotPattern: TilingSprite | null = null;
  private dotPatternFadeFrameId: number | null = null;
  private renderFrameId: number | null = null;

  constructor(private readonly ngZone: NgZone) {
    effect(() => {
      const camera = {panX: this.panX(), panY: this.panY(), zoom: this.zoom()};
      this.viewportW();
      this.viewportH();
      this.cameraLayer?.apply(camera);
    });

    effect(() => {
      const data = this.stickerData();
      void this.stickerLayer?.rebuild(data);
    });

    effect(() => {
      const data = this.labelData();
      void this.labelLayer?.rebuild(data);
    });

    effect(() => {
      this.stickerLayer?.setAnimationStates(this.stickerAnimStates());
    });

    effect(() => {
      this.stickerLayer?.setShadowOffset(this.stickerShadowOffsetX(), this.stickerShadowOffsetY());
    });
  }

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => void this.initializePixi());
  }

  ngOnDestroy(): void {
    this.inputElement.set(null);
    if (this.renderFrameId !== null) {
      cancelAnimationFrame(this.renderFrameId);
    }
    if (this.dotPatternFadeFrameId !== null) {
      cancelAnimationFrame(this.dotPatternFadeFrameId);
    }
    this.cameraLayer?.destroy();
    this.labelLayer?.destroy();
    this.stickerLayer?.destroy();
    this.textures?.clear();
    this.app?.destroy({removeView: true}, {children: true});
    this.app = null;
  }

  private async initializePixi(): Promise<void> {
    const pixi = await import("pixi.js");
    const app = new pixi.Application();
    this.app = app;
    await app.init({
      width: Math.max(1, this.viewportW()),
      height: Math.max(1, this.viewportH()),
      autoDensity: true,
      resolution: Math.max(1, Math.min(window.devicePixelRatio || 1, this.maxResolution())),
      preference: "webgl",
      backgroundAlpha: 0,
      antialias: false,
      autoStart: false,
      powerPreference: "high-performance",
    });

    if (this.app !== app) {
      app.destroy({removeView: true}, {children: true});
      return;
    }

    const backgroundContainer = new pixi.Container({isRenderGroup: true});
    const stickerContainer = new pixi.Container({isRenderGroup: true});
    const labelContainer = new pixi.Container({isRenderGroup: true});
    app.stage.addChild(backgroundContainer, stickerContainer, labelContainer);

    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.display = "block";
    app.canvas.style.touchAction = "none";
    app.canvas.style.pointerEvents = "auto";
    this.host.nativeElement.appendChild(app.canvas);
    this.inputElement.set(app.canvas);

    this.textures = new PixiBoardTextureStore(pixi);
    this.labelLayer = new PixiBoardLabelLayer({
      pixi,
      container: labelContainer,
      textures: this.textures,
      viewportSize: () => ({width: this.viewportW(), height: this.viewportH()}),
      scheduleRender: () => this.scheduleRender(),
    });
    this.stickerLayer = new PixiBoardStickerLayer({
      pixi,
      app,
      container: stickerContainer,
      textures: this.textures,
      scheduleRender: () => this.scheduleRender(),
    });
    this.cameraLayer = new PixiBoardCameraLayer({
      app,
      backgroundContainer,
      stickerContainer,
      viewportSize: () => ({width: this.viewportW(), height: this.viewportH()}),
      smoothingMs: () => this.cameraSmoothingMs(),
      applyLabelTransform: camera => this.labelLayer?.applyCamera(camera),
      scheduleRender: () => this.scheduleRender(),
    });

    this.cameraLayer.apply({panX: this.panX(), panY: this.panY(), zoom: this.zoom()});
    this.stickerLayer.setShadowOffset(this.stickerShadowOffsetX(), this.stickerShadowOffsetY());
    this.stickerLayer.setAnimationStates(this.stickerAnimStates());
    await Promise.all([
      this.installDotPattern(backgroundContainer),
      this.stickerLayer.rebuild(this.stickerData()),
      this.labelLayer.rebuild(this.labelData()),
    ]);
    this.cameraLayer.apply({panX: this.panX(), panY: this.panY(), zoom: this.zoom()});
    await this.warmUpRenderer(app);
    this.scheduleRender();
  }

  private async warmUpRenderer(app: Application): Promise<void> {
    const frames = Math.max(0, Math.floor(this.warmupFrames()));
    for (let index = 0; index < frames; index += 1) {
      if (this.app !== app) {
        return;
      }

      app.render();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  }

  private async installDotPattern(container: Container): Promise<void> {
    const app = this.app;
    const texture = await this.textures?.textureFor(DOT_PATTERN_URL).catch(() => null);
    if (!app || this.app !== app || !texture) {
      return;
    }

    const {TilingSprite} = await import("pixi.js");
    const pattern = new TilingSprite({
      tileScale: {x: 0.5, y: 0.5},
      texture,
      width: this.boardWidth(),
      height: this.boardHeight(),
    });
    pattern.alpha = 0;
    this.dotPattern = pattern;
    container.addChild(pattern);
    this.fadeDotPatternIn(pattern, app);
  }

  private fadeDotPatternIn(pattern: TilingSprite, app: Application): void {
    const startTime = performance.now();
    const step = (timestamp: number): void => {
      if (this.dotPattern !== pattern || this.app !== app) {
        this.dotPatternFadeFrameId = null;
        return;
      }
      const progress = Math.min(1, (timestamp - startTime) / 180);
      pattern.alpha = 1 - (1 - progress) ** 2;
      app.render();
      if (progress < 1) {
        this.dotPatternFadeFrameId = requestAnimationFrame(step);
      } else {
        pattern.alpha = 1;
        this.dotPatternFadeFrameId = null;
      }
    };
    this.dotPatternFadeFrameId = requestAnimationFrame(step);
  }

  private stickerData() {
    return {
      placements: this.placements(),
      stickerCatalog: this.stickerCatalog(),
      bounds: this.bounds(),
      stickerBaseSize: this.stickerBaseSize(),
    };
  }

  private labelData() {
    return {
      ...this.stickerData(),
      placementBadges: this.placementBadges(),
      boardWidth: this.boardWidth(),
      boardHeight: this.boardHeight(),
      zoom: this.zoom(),
      visible: this.showPlacementLabels(),
    };
  }

  private scheduleRender(): void {
    if (!this.app || this.renderFrameId !== null) {
      return;
    }
    this.renderFrameId = requestAnimationFrame(() => {
      this.renderFrameId = null;
      this.app?.render();
    });
  }
}
