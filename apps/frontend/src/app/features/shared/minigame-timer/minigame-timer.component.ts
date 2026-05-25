import {Component, input, output, signal, OnDestroy} from "@angular/core";
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
  displayTime = signal("0.000");
  deviation = signal(0);

  private startTime = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  start(): void {
    this.started.set(true);
    this.stopped.set(false);
    this.displayTime.set("0.000");
    this.startTime = performance.now();
    this.intervalId = setInterval(() => {
      this.displayTime.set(((performance.now() - this.startTime) / 1000).toFixed(3));
    }, 30);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    const sec = (performance.now() - this.startTime) / 1000;
    this.displayTime.set(sec.toFixed(3));
    this.deviation.set(Math.abs(sec - this.targetSec()));
    this.stopped.set(true);
    this.submitted.emit(sec);
  }

  reset(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.started.set(false);
    this.stopped.set(false);
    this.displayTime.set("0.000");
    this.deviation.set(0);
  }
}
