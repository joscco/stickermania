import type {Application, Container} from "pixi.js";

export type PixiBoardCameraState = {
  panX: number;
  panY: number;
  zoom: number;
};

type CameraLayerOptions = {
  app: Application;
  backgroundContainer: Container;
  stickerContainer: Container;
  viewportSize: () => {width: number; height: number};
  smoothingMs: () => number;
  applyLabelTransform: (camera: PixiBoardCameraState) => void;
  scheduleRender: () => void;
};

export class PixiBoardCameraLayer {
  private readonly target: PixiBoardCameraState = {panX: 0, panY: 0, zoom: 1};
  private readonly current: PixiBoardCameraState = {panX: 0, panY: 0, zoom: 1};
  private animationFrameId: number | null = null;
  private lastAnimationTime = 0;
  private hasCurrentState = false;
  private destroyed = false;

  constructor(private readonly options: CameraLayerOptions) {}

  apply(target: PixiBoardCameraState): void {
    if (this.destroyed) {
      return;
    }

    this.resizeRendererIfNeeded();
    Object.assign(this.target, target);

    if (!this.hasCurrentState || this.options.smoothingMs() <= 0) {
      this.snapToTarget();
      this.options.scheduleRender();
      return;
    }

    this.startAnimation();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private resizeRendererIfNeeded(): void {
    const {width, height} = this.options.viewportSize();
    const nextWidth = Math.max(1, Math.round(width));
    const nextHeight = Math.max(1, Math.round(height));

    if (this.options.app.renderer.width !== nextWidth || this.options.app.renderer.height !== nextHeight) {
      this.options.app.renderer.resize(nextWidth, nextHeight);
    }
  }

  private snapToTarget(): void {
    Object.assign(this.current, this.target);
    this.hasCurrentState = true;
    this.applyCurrentTransform();
  }

  private startAnimation(): void {
    if (this.animationFrameId !== null) {
      return;
    }

    this.lastAnimationTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  private readonly animate = (timestamp: number): void => {
    if (this.destroyed) {
      this.animationFrameId = null;
      return;
    }

    const deltaMs = Math.min(50, timestamp - this.lastAnimationTime);
    this.lastAnimationTime = timestamp;
    this.resizeRendererIfNeeded();

    const interpolationAmount = 1 - Math.exp(-deltaMs / Math.max(1, this.options.smoothingMs()));
    this.current.panX = this.interpolate(this.current.panX, this.target.panX, interpolationAmount);
    this.current.panY = this.interpolate(this.current.panY, this.target.panY, interpolationAmount);
    this.current.zoom = this.interpolate(this.current.zoom, this.target.zoom, interpolationAmount);

    if (this.isCloseToTarget()) {
      this.snapToTarget();
      this.options.app.render();
      this.animationFrameId = null;
      return;
    }

    this.applyCurrentTransform();
    this.options.app.render();
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  private applyCurrentTransform(): void {
    const {backgroundContainer, stickerContainer, applyLabelTransform} = this.options;
    backgroundContainer.position.set(this.current.panX, this.current.panY);
    backgroundContainer.scale.set(this.current.zoom);
    stickerContainer.position.set(this.current.panX, this.current.panY);
    stickerContainer.scale.set(this.current.zoom);
    applyLabelTransform(this.current);
  }

  private interpolate(start: number, target: number, amount: number): number {
    return start + (target - start) * amount;
  }

  private isCloseToTarget(): boolean {
    return Math.abs(this.current.panX - this.target.panX) < 0.08
      && Math.abs(this.current.panY - this.target.panY) < 0.08
      && Math.abs(this.current.zoom - this.target.zoom) < 0.0004;
  }
}
