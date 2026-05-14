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
  template: `
    <div class="relative w-full h-7 bg-stone-300/60 rounded-md overflow-hidden select-none">
      <!-- fill that shrinks left ← right -->
      <div
        class="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500 ease-linear"
        [style.width.%]="percent()"
        [class.bg-yellow-400]="percent() > 25"
        [class.bg-red-400]="percent() <= 25"
      ></div>
      <!-- time label centred on top -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-xs font-mono font-bold tracking-tight drop-shadow-sm"
          [class.text-black]="percent() > 25"
          [class.text-white]="percent() <= 25"
        >{{ display() }}</span>
      </div>
    </div>
  `,
})
export class CountdownBarComponent implements OnDestroy {
  readonly endsAt = input<number | null>(null);
  readonly totalDurationSec = input<number>(0);

  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => this.now.set(Date.now()), 250);
  }

  ngOnDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  readonly remainingSec = computed(() => {
    const e = this.endsAt();
    return e ? Math.max(0, Math.ceil((e - this.now()) / 1000)) : 0;
  });

  readonly percent = computed(() => {
    const total = this.totalDurationSec();
    if (!total || !this.endsAt()) return 0;
    return Math.min(100, Math.max(0, (this.remainingSec() / total) * 100));
  });

  readonly display = computed(() => {
    const sec = this.remainingSec();
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  });
}
