import {DestroyRef, effect, inject, Injectable, signal, computed} from "@angular/core";
import {WorldStore} from "../../../core/world.store";

@Injectable()
export class PlayerTimerService {
  private readonly worldStore = inject(WorldStore);
  private readonly destroyRef = inject(DestroyRef);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  public readonly timeLeft = signal<string>("");
  public readonly percentLeft = signal(100);

  public readonly remainingSec = signal(0);
  public readonly endsAt = computed(() => {
    const ps = this.worldStore.stickerCollageGameState()?.phaseState;
    if (!ps) return 0;
    if (ps.phase === "BUILDING") return ps.roundEndsAt;
    if (ps.phase === "VOTING") return ps.votingEndsAt;
    return 0;
  });

  public readonly totalDurationSec = signal(0);

  constructor() {
    effect(() => {
      const e = this.endsAt();
      this.clearTimer();

      if (e <= 0) {
        this.timeLeft.set("");
        this.percentLeft.set(100);
        this.totalDurationSec.set(0);
        return;
      }

      const gameState = this.worldStore.stickerCollageGameState();
      const phase = gameState?.phaseState.phase;
      let totalSec = 0;
      if (phase === "BUILDING") {
        totalSec = gameState?.roundDurationSec
          || (gameState?.roundStartedAt ? Math.ceil((e - gameState.roundStartedAt) / 1000) : 0)
          || 0;
      } else if (phase === "VOTING") {
        totalSec = gameState?.votingDurationSec ?? 0;
      }
      this.totalDurationSec.set(totalSec);

      const tick = () => {
        const remaining = Math.max(0, e - Date.now());
        const s = Math.ceil(remaining / 1000);
        const min = Math.floor(s / 60);
        const sec = s % 60;
        this.timeLeft.set(`${min}:${String(sec).padStart(2, "0")}`);

        if (totalSec > 0) {
          this.percentLeft.set(Math.min(100, Math.max(0, (s / totalSec) * 100)));
        } else {
          this.percentLeft.set(100);
        }
      };

      tick();
      this.timerInterval = setInterval(tick, 500);
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
