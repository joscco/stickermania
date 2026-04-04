import { computed, DestroyRef, effect, inject, Injectable, signal } from "@angular/core";
import { WorldStore } from "../../core/world.store";

@Injectable()
export class PlayerTimerService {
  private readonly worldStore = inject(WorldStore);
  private readonly destroyRef = inject(DestroyRef);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public readonly timeLeft = signal<string>("");

  constructor() {
    effect(() => {
      const endsAt = 0
      this.clearTimer();

      if (endsAt <= 0) {
        this.timeLeft.set("");
        return;
      }

      const updateCountdown = () => {
        const remaining = Math.max(0, endsAt - Date.now());
        const totalSec = Math.ceil(remaining / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        this.timeLeft.set(`${min}:${String(sec).padStart(2, "0")}`);
      };

      updateCountdown();
      this.timerInterval = setInterval(updateCountdown, 500);
    });

    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  private clearTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}

