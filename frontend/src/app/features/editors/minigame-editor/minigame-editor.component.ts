import {CommonModule} from "@angular/common";
import {Component, computed, signal} from "@angular/core";
import {TimerStopGame} from "../../../../../../minigames/timer-stop/game";
import type {
  TimerStopPlayerResult,
  TimerStopSubmission,
} from "../../../../../../minigames/timer-stop/game";
import {TIMER_STOP_VARIANTS} from "../../../../../../minigames/timer-stop/variants";
import {TimerStopPhaseComponent} from "../../../../../../minigames/timer-stop/player-ui/phase-0-stop/timer-stop-phase.component";
import {TimerStopResultComponent} from "../../../../../../minigames/timer-stop/player-ui/result/timer-stop-result.component";
import type {
  TimerStopPlayerUiEvent,
  TimerStopPlayerUiState,
} from "../../../../../../minigames/timer-stop/player-ui/ui-contract";
import {TIMER_STOP_STAGE_SIZE} from "../../../../../../minigames/timer-stop/player-ui/ui-contract";
import {MinigameStageComponent} from "../../../../../../minigames/_shared/minigame-stage/minigame-stage.component";

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
    TimerStopPhaseComponent,
    TimerStopResultComponent,
  ],
  templateUrl: "./minigame-editor.component.html",
  host: {class: "block h-dvh overflow-hidden bg-neutral-100 text-neutral-950"},
})
export class MinigameEditorComponent {
  public readonly stageSize = TIMER_STOP_STAGE_SIZE;
  public readonly variants = TIMER_STOP_VARIANTS;
  public readonly selectedVariantIndex = signal(0);
  public readonly phase = signal<EditorPhase>("play");
  public readonly players = signal<SimPlayer[]>([
    {id: "p1", name: "Alice"},
    {id: "p2", name: "Bob"},
    {id: "p3", name: "Charlie"},
    {id: "p4", name: "Diana"},
  ]);
  public readonly submissionsByPlayerId = signal<Record<string, TimerStopSubmission>>({});
  public readonly draftsByPlayerId = signal<Record<string, number>>({});
  public readonly manualSecondsByPlayerId = signal<Record<string, number>>({
    p1: 4.82,
    p2: 5.31,
    p3: 5.02,
    p4: 6.14,
  });

  public readonly selectedVariant = computed(
    () => this.variants[this.selectedVariantIndex()] ?? this.variants[0],
  );

  public readonly game = computed(() => new TimerStopGame(this.selectedVariant()));

  public readonly result = computed(() => {
    const submissions = Object.values(this.submissionsByPlayerId());
    if (submissions.length === 0) return null;
    return this.game().calculateResults(submissions);
  });

  public readonly submittedCount = computed(
    () => Object.keys(this.submissionsByPlayerId()).length,
  );

  public readonly rankedResults = computed(() => {
    const result = this.result();
    if (!result) return [];

    return Object.values(result.resultsByPlayerId).sort(
      (a, b) =>
        a.placement - b.placement ||
        a.deviationSeconds - b.deviationSeconds ||
        a.playerId.localeCompare(b.playerId),
    );
  });

  public readonly canEvaluate = computed(() => this.submittedCount() > 0);

  public selectVariant(index: number): void {
    this.selectedVariantIndex.set(index);
    this.resetRound();
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
    this.manualSecondsByPlayerId.update((values) => ({
      ...values,
      [id]: this.selectedVariant().targetSeconds,
    }));
  }

  public removePlayer(playerId: string): void {
    if (this.players().length <= 1) return;

    this.players.update((players) => players.filter((player) => player.id !== playerId));
    this.submissionsByPlayerId.update((submissions) => {
      const next = {...submissions};
      delete next[playerId];
      return next;
    });
    this.draftsByPlayerId.update((drafts) => {
      const next = {...drafts};
      delete next[playerId];
      return next;
    });
    this.manualSecondsByPlayerId.update((values) => {
      const next = {...values};
      delete next[playerId];
      return next;
    });
  }

  public renamePlayer(playerId: string, event: Event): void {
    const name = (event.target as HTMLInputElement).value.trim();
    if (!name) return;

    this.players.update((players) =>
      players.map((player) => (player.id === playerId ? {...player, name} : player)),
    );
  }

  public setManualSeconds(playerId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;

    this.manualSecondsByPlayerId.update((values) => ({
      ...values,
      [playerId]: value,
    }));
  }

  public manualSecondsFor(playerId: string): number {
    return this.manualSecondsByPlayerId()[playerId] ?? this.selectedVariant().targetSeconds;
  }

  public submitManual(playerId: string): void {
    this.setDraft(playerId, this.manualSecondsFor(playerId));
  }

  public fillSampleSubmissions(): void {
    for (const player of this.players()) {
      this.submit(player.id, this.manualSecondsFor(player.id));
    }
  }

  public clearSubmission(playerId: string): void {
    this.submissionsByPlayerId.update((submissions) => {
      const next = {...submissions};
      delete next[playerId];
      return next;
    });
    this.draftsByPlayerId.update((drafts) => {
      const next = {...drafts};
      delete next[playerId];
      return next;
    });
    if (this.submittedCount() === 0) this.phase.set("play");
  }

  public submitPlayer(playerId: string): void {
    const draft = this.draftsByPlayerId()[playerId];
    if (draft === undefined) return;

    this.submit(playerId, draft);
  }

  public skipPlayer(playerId: string): void {
    this.clearSubmission(playerId);
  }

  public resetRound(): void {
    this.submissionsByPlayerId.set({});
    this.draftsByPlayerId.set({});
    this.phase.set("play");
  }

  public onPlayerEvent(event: TimerStopPlayerUiEvent): void {
    if (event.type === "draft-change") {
      this.setDraft(event.playerId, event.stoppedAtSeconds);
      return;
    }

    this.phase.set("play");
  }

  public stateFor(player: SimPlayer): TimerStopPlayerUiState {
    const submission = this.submissionsByPlayerId()[player.id];
    const ownResult = this.result()?.resultsByPlayerId[player.id];

    return {
      playerId: player.id,
      phase: this.phase() === "play" ? "stop" : "result",
      variantData: this.selectedVariant(),
      ownSubmission: submission,
      draftStoppedAtSeconds: this.draftsByPlayerId()[player.id],
      ownResult,
      roundEndsAt: Date.now() + this.selectedVariant().firstRoundSeconds * 1000,
      serverNow: Date.now(),
    };
  }

  public resultFor(playerId: string): TimerStopPlayerResult | null {
    return this.result()?.resultsByPlayerId[playerId] ?? null;
  }

  public playerName(playerId: string): string {
    return this.players().find((player) => player.id === playerId)?.name ?? playerId;
  }

  private submit(playerId: string, stoppedAtSeconds: number): void {
    this.submissionsByPlayerId.update((submissions) => ({
      ...submissions,
      [playerId]: {
        playerId,
        stoppedAtSeconds: Math.max(0, stoppedAtSeconds),
      },
    }));
  }

  private setDraft(playerId: string, stoppedAtSeconds: number): void {
    this.draftsByPlayerId.update((drafts) => ({
      ...drafts,
      [playerId]: Math.max(0, stoppedAtSeconds),
    }));
  }
}
