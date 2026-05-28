import {CommonModule} from "@angular/common";
import {
  Component,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from "@angular/core";
import {
  TimerStopPlayerUiEvent,
  TimerStopPlayerUiState,
} from "../ui-contract";

@Component({
  selector: "sm-timer-stop-phase",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./timer-stop-phase.component.html",
})
export class TimerStopPhaseComponent implements OnDestroy {
  public readonly state = input.required<TimerStopPlayerUiState>();
  public readonly playerEvent = output<TimerStopPlayerUiEvent>();

  private readonly startedAt = signal<number | null>(null);
  private readonly stoppedAt = signal<number | null>(null);
  private readonly now = signal(Date.now());

  private intervalId: ReturnType<typeof setInterval> | null = null;

  public readonly hasStarted = computed(() => this.startedAt() !== null);
  public readonly hasStopped = computed(() => this.stoppedAt() !== null);

  public readonly elapsedSeconds = computed(() => {
    const startedAt = this.startedAt();
    const stoppedAt = this.stoppedAt();

    if (startedAt === null) {
      return 0;
    }

    return ((stoppedAt ?? this.now()) - startedAt) / 1000;
  });

  public startTimer(): void {
    if (this.hasStarted()) {
      return;
    }

    this.startNewRun();
  }

  public restartTimer(): void {
    this.clearTimerInterval();
    this.startedAt.set(null);
    this.stoppedAt.set(null);
    this.startNewRun();
  }

  public stopTimer(): void {
    if (!this.hasStarted() || this.hasStopped()) {
      return;
    }

    const stoppedAt = Date.now();
    this.stoppedAt.set(stoppedAt);
    this.clearTimerInterval();

    this.playerEvent.emit({
      type: "draft-change",
      playerId: this.state().playerId,
      stoppedAtSeconds: this.elapsedSeconds(),
    });
  }

  public ngOnDestroy(): void {
    this.clearTimerInterval();
  }

  private startNewRun(): void {
    const now = Date.now();

    this.startedAt.set(now);
    this.stoppedAt.set(null);
    this.now.set(now);

    this.intervalId = setInterval(() => {
      this.now.set(Date.now());
    }, 40);
  }

  private clearTimerInterval(): void {
    if (this.intervalId === null) {
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
  }
}