import {CommonModule} from "@angular/common";
import {Component, computed, effect, input, output, signal} from "@angular/core";
import type {MinigameClientAction, MinigameTask} from "@birthday/shared";
import {AnimGroupDirective, AnimOnInitDirective} from "../../../../shared/animations/anim-on-init.directive";
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
    AnimOnInitDirective,
  ],
  templateUrl: "./player-building.component.html",
  host: {"class": "h-full flex-1 flex flex-col"},
})
export class PlayerBuildingComponent {
  public readonly stageContainerMaxWidth = `min(100%, 420px, calc((100dvh - 12rem) * ${MINIGAME_STAGE_WIDTH} / ${MINIGAME_STAGE_HEIGHT}))`;
  public readonly stageAspectRatio = `${MINIGAME_STAGE_WIDTH} / ${MINIGAME_STAGE_HEIGHT}`;

  public readonly roundIndex = input<number>(0);
  public readonly prompt = input<string>("");
  public readonly task = input<MinigameTask | null>(null);
  public readonly playerId = input<string>("");
  public readonly timeUp = input<boolean>(false);

  public readonly skipRound = output<void>();
  public readonly submitMinigame = output<MinigameSubmitEvent>();

  public readonly draft = signal<unknown>(null);
  private readonly autoSubmittedRoundKey = signal<string | null>(null);

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
      playerId: this.playerId(),
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

  public constructor() {
    effect(() => {
      if (!this.timeUp() || !this.canSubmit()) return;

      const task = this.task();
      if (!task) return;

      const roundKey = `${this.roundIndex()}:${task.id}`;
      if (this.autoSubmittedRoundKey() === roundKey) return;

      this.autoSubmittedRoundKey.set(roundKey);
      this.submitCurrentTask();
    });
  }

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

  public submitCurrentTaskFromPointer(event: PointerEvent): void {
    event.preventDefault();
    this.blurActiveInput();
    this.submitCurrentTask();
  }

  public skipRoundFromPointer(event: PointerEvent): void {
    event.preventDefault();
    this.blurActiveInput();
    this.skipRound.emit();
  }

  private currentDraft(): unknown {
    const definition = this.minigameDefinition();
    const draft = this.draft();
    return draft ?? definition?.initialDraft();
  }

  private blurActiveInput(): void {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }
}
