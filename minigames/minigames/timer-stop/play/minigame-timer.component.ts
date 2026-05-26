import {Component, input, output, signal, computed, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";

@Component({
  selector: "app-minigame-timer",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./minigame-timer.component.html",
  host: {"class": "flex-1 flex flex-col items-center justify-center gap-6 p-6"},
})
export class MinigameTimerComponent implements OnDestroy {
  readonly targetSec = input(5);
  readonly submitted = output<number>();

  started = signal(false);
  stopped = signal(false);
  deviation = signal(0);

  /** Visual progress 0-1 (clamped to 2x target for visual range) */
  barProgress = signal(0);

  private startTime = 0;
  private maxVisualSec = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  start(): void {
    this.started.set(true);
    this.stopped.set(false);
    this.deviation.set(0);
    this.barProgress.set(0);
    this.startTime = performance.now();
    this.maxVisualSec = this.targetSec() * 2;
    this.intervalId = setInterval(() => {
      const elapsed = (performance.now() - this.startTime) / 1000;
      this.barProgress.set(Math.min(1, elapsed / this.maxVisualSec));
    }, 30);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    const sec = (performance.now() - this.startTime) / 1000;
    this.deviation.set(Math.abs(sec - this.targetSec()));
    this.barProgress.set(Math.min(1, sec / this.maxVisualSec));
    this.stopped.set(true);
    this.submitted.emit(sec);
  }

  reset(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.started.set(false);
    this.stopped.set(false);
    this.deviation.set(0);
    this.barProgress.set(0);
  }

  /** Called by parent submit button */
  submit(): void {
    if (!this.started()) { this.start(); return; }
    if (!this.stopped()) { this.stop(); return; }
    this.reset();
  }
}
