import {
  Component,
  input,
  computed,
  OnDestroy,
  signal,
} from "@angular/core";

@Component({
  selector: "app-countdown-bar",
  standalone: true,
  templateUrl: "./countdown-bar.component.html",
})
export class CountdownBarComponent implements OnDestroy {
  readonly endsAt = input<number | null>(null);
  readonly totalDurationSec = input<number>(0);
  readonly timeLeft = input<string | null>(null);
  readonly percentLeft = input<number | null>(null);

  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => this.now.set(Date.now()), 250);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  readonly remainingSec = computed(() => {
    const e = this.endsAt();
    return e ? Math.max(0, Math.ceil((e - this.now()) / 1000)) : 0;
  });

  readonly computedPercentLeft = computed(() => {
    const directPercent = this.percentLeft();
    if (directPercent !== null) {
      return Math.min(100, Math.max(0, directPercent));
    }

    const total = this.totalDurationSec();
    if (!total || !this.endsAt()) return 0;
    return Math.min(100, Math.max(0, (this.remainingSec() / total) * 100));
  });

  readonly fillPercent = computed(() => Math.min(100, Math.max(0, 100 - this.computedPercentLeft())));

  readonly display = computed(() => {
    const directDisplay = this.timeLeft();
    if (directDisplay) return directDisplay;

    const sec = this.remainingSec();
    if (sec <= 0) return "";

    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  });
}
