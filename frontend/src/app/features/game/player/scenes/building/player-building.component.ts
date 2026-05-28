import {CommonModule} from "@angular/common";
import {Component, computed, input, output, signal} from "@angular/core";
import type {MinigameClientAction, MinigameTask} from "@birthday/shared";
import {AnimGroupDirective} from "../../../../shared/animations/anim-on-init.directive";
import {MinigameComponentHostComponent} from "../../../../../../../../minigames/_shared/minigame-component-host/minigame-component-host.component";
import {MinigameStageComponent} from "../../../../../../../../minigames/_shared/minigame-stage/minigame-stage.component";
import {
  MINIGAME_STAGE_HEIGHT,
  MINIGAME_STAGE_WIDTH,
} from "../../../../../../../../minigames/_shared/minigame-stage-size";
import {getMinigameFrontendDefinition} from "../../../../../../../../minigames/frontend-registry";

export type MinigameSubmitEvent = MinigameClientAction;

@Component({
  selector: "app-player-building",
  standalone: true,
  imports: [
    CommonModule,
    AnimGroupDirective,
    MinigameStageComponent,
    MinigameComponentHostComponent,
  ],
  templateUrl: "./player-building.component.html",
  host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerBuildingComponent {
  public readonly stageContainerMaxWidth = `min(100%, calc((100dvh - 9rem) * ${MINIGAME_STAGE_WIDTH} / ${MINIGAME_STAGE_HEIGHT}))`;
  public readonly stageAspectRatio = `${MINIGAME_STAGE_WIDTH} / ${MINIGAME_STAGE_HEIGHT}`;

  public readonly roundIndex = input<number>(0);
  public readonly prompt = input<string>("");
  public readonly task = input<MinigameTask | null>(null);

  public readonly skipRound = output<void>();
  public readonly submitMinigame = output<MinigameSubmitEvent>();

  public readonly draft = signal<unknown>(null);

  public readonly minigameDefinition = computed(() =>
    getMinigameFrontendDefinition(this.task()?.type),
  );

  public readonly canSubmit = computed(() => {
    const definition = this.minigameDefinition();
    return definition ? definition.canSubmit(this.currentDraft(), this.task() ?? undefined) : false;
  });

  public readonly minigameState = computed(() => {
    const task = this.task();
    const definition = this.minigameDefinition();
    if (!task || !definition) return null;

    const durationSec = Number(task.durationSec ?? 60);
    return definition.createPlayState({
      playerId: "local-player",
      task,
      draft: this.currentDraft(),
      roundEndsAt: Date.now() + durationSec * 1000,
      serverNow: Date.now(),
    });
  });

  public readonly minigamePhaseComponent = computed(() => {
    const definition = this.minigameDefinition();
    const task = this.task();
    if (!definition || !task) return null;
    return definition.phaseComponentForTask?.(task) ?? definition.phaseComponent;
  });

  public onMinigameEvent(event: unknown): void {
    const definition = this.minigameDefinition();
    if (!definition) return;

    this.draft.set(definition.reducePlayerEvent(event, this.currentDraft()));
  }

  public submitCurrentTask(): void {
    const task = this.task();
    const definition = this.minigameDefinition();
    if (!task || !definition || !definition.canSubmit(this.currentDraft(), task)) return;

    this.submitMinigame.emit({
      type: "submit-minigame",
      minigameType: definition.type,
      payload: definition.createSubmitPayload(this.currentDraft(), task),
    });
  }

  private currentDraft(): unknown {
    const definition = this.minigameDefinition();
    const draft = this.draft();
    return draft ?? definition?.initialDraft();
  }
}
