import {CommonModule} from "@angular/common";
import {Component, Type, computed, signal} from "@angular/core";
import type {MinigameTask} from "@birthday/shared";
import type {MinigamePlayerResult, MinigameSubmission} from "../../../../../../packages/shared/src/minigame";
import {MinigameComponentHostComponent} from "../../../../../../minigames/_shared/minigame-component-host/minigame-component-host.component";
import {MinigameStageComponent} from "../../../../../../minigames/_shared/minigame-stage/minigame-stage.component";
import {
  MinigameFrontendDefinition,
  getMinigameFrontendDefinitions,
} from "../../../../../../minigames/frontend-registry";

type EditorPhase = "play" | "result";

interface SimPlayer {
  id: string;
  name: string;
}

@Component({
  selector: "app-minigame-editor",
  standalone: true,
  imports: [
    CommonModule,
    MinigameStageComponent,
    MinigameComponentHostComponent,
  ],
  templateUrl: "./minigame-editor.component.html",
  host: {class: "block h-dvh overflow-hidden bg-neutral-100 text-neutral-950"},
})
export class MinigameEditorComponent {
  public readonly definitions = getMinigameFrontendDefinitions();
  public readonly selectedDefinitionIndex = signal(0);
  public readonly selectedVariantIndex = signal(0);
  public readonly editorTaskOverride = signal<MinigameTask | null>(null);
  public readonly phase = signal<EditorPhase>("play");
  public readonly players = signal<SimPlayer[]>([
    {id: "p1", name: "Alice"},
    {id: "p2", name: "Bob"},
    {id: "p3", name: "Charlie"},
    {id: "p4", name: "Diana"},
  ]);
  public readonly submissionsByPlayerId = signal<Record<string, MinigameSubmission>>({});
  public readonly draftsByPlayerId = signal<Record<string, unknown>>({});

  public readonly definition = computed(
    () => this.definitions[this.selectedDefinitionIndex()] ?? this.definitions[0],
  );
  public readonly selectedVariant = computed(
    () => this.definition().variants[this.selectedVariantIndex()] ?? this.definition().variants[0],
  );
  public readonly selectedTask = computed(() =>
    this.editorTaskOverride() ?? this.definition().taskFromVariant(this.selectedVariant()),
  );
  public readonly result = computed(() => {
    const submissions = Object.values(this.submissionsByPlayerId());
    if (submissions.length === 0) return null;

    return this.definition().calculateResults(
      submissions,
      this.selectedVariant(),
      this.selectedTask(),
    );
  });
  public readonly submittedCount = computed(
    () => Object.keys(this.submissionsByPlayerId()).length,
  );
  public readonly canEvaluate = computed(() => this.submittedCount() > 0);
  public readonly canStartFollowUp = computed(() => {
    const definition = this.definition();
    return this.submittedCount() > 0 &&
      !!definition.createEditorFollowUpTask?.({
        task: this.selectedTask(),
        submissions: Object.values(this.submissionsByPlayerId()),
        variant: this.selectedVariant(),
        nextRoundIndex: 1,
      });
  });
  public readonly editorPhaseOptions = computed(() => {
    const definition = this.definition();
    const overrideTask = this.editorTaskOverride();

    if (overrideTask) {
      return [
        {
          key: "answer",
          label: "1. Antwortphase",
          task: definition.taskFromVariant(this.selectedVariant()),
        },
        {
          key: "rate",
          label: "2. Bewertungsphase",
          task: overrideTask,
        },
      ];
    }

    return definition.editorPhaseOptions?.({
      task: this.selectedTask(),
      submissions: Object.values(this.submissionsByPlayerId()),
      variant: this.selectedVariant(),
    }) ?? [];
  });
  public readonly selectedEditorPhaseKey = computed(() =>
    String(this.selectedTask()["phase"] ?? "default"),
  );
  public readonly rankedResults = computed(() => {
    const result = this.result();
    if (!result) return [];

    return Object.values(result.resultsByPlayerId).sort(
      (a, b) => a.placement - b.placement || a.playerId.localeCompare(b.playerId),
    );
  });

  public selectDefinition(index: number): void {
    this.selectedDefinitionIndex.set(index);
    this.selectedVariantIndex.set(0);
    this.resetRound();
  }

  public selectDefinitionFromEvent(event: Event): void {
    this.selectDefinition(Number((event.target as HTMLSelectElement).value));
  }

  public selectVariant(index: number): void {
    this.selectedVariantIndex.set(index);
    this.resetRound();
  }

  public selectEditorPhase(event: Event): void {
    const selectedKey = (event.target as HTMLSelectElement).value;
    const option = this.editorPhaseOptions().find((entry) => entry.key === selectedKey);
    if (!option || option.disabled) return;

    this.editorTaskOverride.set(selectedKey === "answer" ? null : option.task);
    this.submissionsByPlayerId.set({});
    this.draftsByPlayerId.set({});
    this.phase.set("play");
  }

  public setPhase(phase: EditorPhase): void {
    if (phase === "result" && !this.canEvaluate()) return;
    this.phase.set(phase);
  }

  public addPlayer(): void {
    const nextIndex = this.players().length + 1;
    const id = `p${Date.now()}`;
    this.players.update((players) => [
      ...players,
      {id, name: `Spieler ${nextIndex}`},
    ]);
  }

  public removePlayer(playerId: string): void {
    if (this.players().length <= 1) return;

    this.players.update((players) => players.filter((player) => player.id !== playerId));
    this.submissionsByPlayerId.update((values) => removeRecordKey(values, playerId));
    this.draftsByPlayerId.update((values) => removeRecordKey(values, playerId));
  }

  public renamePlayer(playerId: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim();
    if (!name) return;

    this.players.update((players) =>
      players.map((player) => (player.id === playerId ? {...player, name} : player)),
    );
  }

  public fillSampleSubmissions(): void {
    this.submissionsByPlayerId.set(
      Object.fromEntries(
        this.players().map((player, index) => [
          player.id,
          this.definition().createSampleSubmission(player.id, index, this.selectedTask()),
        ]),
      ),
    );
  }

  public clearSubmission(playerId: string): void {
    this.submissionsByPlayerId.update((submissions) => removeRecordKey(submissions, playerId));
    this.draftsByPlayerId.update((drafts) => removeRecordKey(drafts, playerId));
    if (this.submittedCount() === 0) this.phase.set("play");
  }

  public submitPlayer(playerId: string): void {
    const submission = this.definition().createEditorSubmission(
      playerId,
      this.draftFor(playerId),
      this.selectedTask(),
    );
    if (!submission) return;

    this.submissionsByPlayerId.update((submissions) => ({
      ...submissions,
      [playerId]: submission,
    }));
  }

  public skipPlayer(playerId: string): void {
    this.clearSubmission(playerId);
  }

  public resetRound(): void {
    this.submissionsByPlayerId.set({});
    this.draftsByPlayerId.set({});
    this.editorTaskOverride.set(null);
    this.phase.set("play");
  }

  public startFollowUpRound(): void {
    const followUpTask = this.definition().createEditorFollowUpTask?.({
      task: this.selectedTask(),
      submissions: Object.values(this.submissionsByPlayerId()),
      variant: this.selectedVariant(),
      nextRoundIndex: 1,
    });
    if (!followUpTask) return;

    this.editorTaskOverride.set(followUpTask);
    this.submissionsByPlayerId.set({});
    this.draftsByPlayerId.set({});
    this.phase.set("play");
  }

  public onMinigameEvent(playerId: string, event: unknown): void {
    this.draftsByPlayerId.update((drafts) => ({
      ...drafts,
      [playerId]: this.definition().reducePlayerEvent(event, this.draftFor(playerId)),
    }));
  }

  public playStateFor(player: SimPlayer): unknown {
    return this.definition().createPlayState({
      playerId: player.id,
      task: this.selectedTask(),
      draft: this.draftFor(player.id),
      ownSubmission: this.submissionsByPlayerId()[player.id],
      ownResult: this.resultFor(player.id) ?? undefined,
      roundEndsAt: Date.now() + Number(this.selectedTask().durationSec ?? 60) * 1000,
      serverNow: Date.now(),
    });
  }

  public phaseComponentForCurrentTask(): Type<unknown> {
    const definition = this.definition();
    return definition.phaseComponentForTask?.(this.selectedTask()) ?? definition.phaseComponent;
  }

  public resultStateFor(player: SimPlayer): unknown {
    return this.definition().createResultState({
      playerId: player.id,
      task: this.selectedTask(),
      ownSubmission: this.submissionsByPlayerId()[player.id],
      ownResult: this.resultFor(player.id) ?? undefined,
      roundEndsAt: 0,
      serverNow: Date.now(),
    });
  }

  public resultFor(playerId: string): MinigamePlayerResult | null {
    return this.result()?.resultsByPlayerId[playerId] ?? null;
  }

  public playerName(playerId: string): string {
    return this.players().find((player) => player.id === playerId)?.name ?? playerId;
  }

  public submissionLabel(playerId: string): string | null {
    const submission = this.submissionsByPlayerId()[playerId];
    if (!submission) return null;
    return this.definition().submissionLabel(submission, this.selectedVariant());
  }

  public draftLabel(playerId: string): string | null {
    return this.definition().draftLabel(this.draftFor(playerId), this.selectedVariant());
  }

  public canSubmitPlayer(playerId: string): boolean {
    return this.definition().canSubmit(this.draftFor(playerId), this.selectedTask());
  }

  public resultDetail(result: MinigamePlayerResult): string {
    return this.definition().resultDetail(result);
  }

  public resultValue(result: MinigamePlayerResult): string {
    return this.definition().resultValue(result);
  }

  public resultUnitLabel(result: MinigamePlayerResult): string {
    return this.definition().resultUnitLabel(result);
  }

  public variantMeta(
    definition: MinigameFrontendDefinition,
    variant: unknown,
  ): string {
    return definition.variantMeta(variant);
  }

  private draftFor(playerId: string): unknown {
    return this.draftsByPlayerId()[playerId] ?? this.definition().initialDraft();
  }
}

function removeRecordKey<T>(values: Record<string, T>, key: string): Record<string, T> {
  const next = {...values};
  delete next[key];
  return next;
}
