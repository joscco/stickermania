import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  signal,
  viewChild,
} from "@angular/core";

@Component({
  selector: "sm-minigame-stage",
  standalone: true,
  host: {class: "block w-full"},
  templateUrl: "./minigame-stage.component.html",
})
export class MinigameStageComponent implements AfterViewInit, OnDestroy {
  public readonly stageSize = input(400);
  private readonly frame = viewChild.required<ElementRef<HTMLElement>>("frame");
  private readonly frameSize = signal<number | null>(null);
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;
  private remainingMeasureAttempts = 30;

  public readonly scale = computed(() => {
    const size = this.stageSize();
    if (size <= 0) {
      return 1;
    }

    return (this.frameSize() ?? size) / size;
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
    const nextSize = Math.min(width, height);
    if (nextSize > 0) this.frameSize.set(nextSize);
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
