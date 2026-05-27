import {CommonModule} from "@angular/common";
import {Component, computed, input, output, signal} from "@angular/core";
import type {MinigameClientAction, MinigameTask} from "@birthday/shared";
import {AnimGroupDirective} from "../../../../shared/animations/anim-on-init.directive";
import {MinigameStageComponent} from "../../../../../../../../minigames/_shared/minigame-stage/minigame-stage.component";
import {TimerStopPhaseComponent} from "../../../../../../../../minigames/timer-stop/player-ui/phase-0-stop/timer-stop-phase.component";
import {
  TIMER_STOP_STAGE_SIZE,
  TimerStopPlayerUiEvent,
  TimerStopPlayerUiState,
} from "../../../../../../../../minigames/timer-stop/player-ui/ui-contract";

export type MinigameSubmitEvent = MinigameClientAction;

@Component({
  selector: "app-player-building",
  standalone: true,
  imports: [
    CommonModule,
    AnimGroupDirective,
    MinigameStageComponent,
    TimerStopPhaseComponent,
  ],
  templateUrl: "./player-building.component.html",
  host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerBuildingComponent {
  public readonly roundIndex = input<number>(0);
  public readonly prompt = input<string>("");
  public readonly task = input<MinigameTask | null>(null);

  public readonly skipRound = output<void>();
  public readonly submitMinigame = output<MinigameSubmitEvent>();

  public readonly stageSize = TIMER_STOP_STAGE_SIZE;
  public readonly timerDraftSeconds = signal<number | null>(null);

  public readonly canSubmit = computed(() => {
    const task = this.task();
    if (!task) return false;
    if (task.type === "timer-stop") return this.timerDraftSeconds() !== null;
    return false;
  });

  public timerState(): TimerStopPlayerUiState | null {
    const task = this.task();
    if (!task || task.type !== "timer-stop") return null;

    const targetSeconds = Number(task["targetSec"] ?? 5);
    const firstRoundSeconds = Number(task["durationSec"] ?? targetSeconds + 5);

    return {
      playerId: "local-player",
      phase: "stop",
      variantData: {
        id: task.id,
        title: task.title,
        firstRoundSeconds,
        targetSeconds,
      },
      draftStoppedAtSeconds: this.timerDraftSeconds() ?? undefined,
      roundEndsAt: Date.now() + firstRoundSeconds * 1000,
      serverNow: Date.now(),
    };
  }

  public onTimerEvent(event: TimerStopPlayerUiEvent): void {
    if (event.type === "draft-change") {
      this.timerDraftSeconds.set(event.stoppedAtSeconds);
    }
  }

  public submitCurrentTask(): void {
    const task = this.task();
    if (!task) return;

    if (task.type === "timer-stop") {
      const stoppedAtSeconds = this.timerDraftSeconds();
      if (stoppedAtSeconds === null) return;

      this.submitMinigame.emit({
        type: "submit-minigame",
        minigameType: "timer-stop",
        payload: {stoppedAtSeconds},
      });
    }
  }
}
