import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  signal,
  viewChild,
} from "@angular/core";
import {
  MINIGAME_STAGE_HEIGHT,
  MINIGAME_STAGE_WIDTH,
} from "../minigame-stage-size";

@Component({
  selector: "sm-minigame-stage",
  standalone: true,
  host: {class: "block w-full"},
  templateUrl: "./minigame-stage.component.html",
})
export class MinigameStageComponent implements AfterViewInit, OnDestroy {
  public readonly stageWidth = MINIGAME_STAGE_WIDTH;
  public readonly stageHeight = MINIGAME_STAGE_HEIGHT;
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>("frame");
  private readonly frameSize = signal<{width: number; height: number} | null>(null);
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;
  private remainingMeasureAttempts = 30;

  public readonly aspectRatio = `${this.stageWidth} / ${this.stageHeight}`;

  public readonly scale = computed(() => {
    const width = this.stageWidth;
    const height = this.stageHeight;
    if (width <= 0 || height <= 0) {
      return 1;
    }

    const frameSize = this.frameSize();
    if (!frameSize) return 1;

    return Math.min(frameSize.width / width, frameSize.height / height);
  });

  public readonly transform = computed(() => `scale(${this.scale()})`);

  public ngAfterViewInit(): void {
    const frame = this.frame().nativeElement;

    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;

      this.setMeasuredSize(entry.contentRect.width, entry.contentRect.height);
    });

    this.resizeObserver.observe(frame);
    this.measureFrame(frame);
    this.scheduleMeasure(frame);
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
  }

  private measureFrame(frame: HTMLElement): void {
    this.setMeasuredSize(frame.clientWidth, frame.clientHeight);
  }

  private setMeasuredSize(width: number, height: number): void {
    if (width > 0 && height > 0) this.frameSize.set({width, height});
  }

  private scheduleMeasure(frame: HTMLElement): void {
    this.animationFrameId = requestAnimationFrame(() => {
      this.measureFrame(frame);

      if (this.frameSize() === null && this.remainingMeasureAttempts > 0) {
        this.remainingMeasureAttempts--;
        this.scheduleMeasure(frame);
      }
    });
  }
}
