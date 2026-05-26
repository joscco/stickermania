import {Component, signal, computed, inject, OnInit, viewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {minigameRegistry} from "@birthday/shared";
import type {MinigameSubmission, StickerCollage, StickerCollageVoteResult} from "@birthday/shared";
import {StickerBoardComponent} from "../../minigames/sticker-place/play/sticker-board.component";
import {DrawingCanvasBgComponent} from "../../minigames/drawing/play/drawing-canvas-bg.component";
import {MinigameChoiceComponent} from "../../minigames/choice/play/minigame-choice.component";
import {MinigameNumberComponent} from "../../minigames/number/play/minigame-number.component";
import {MinigameTimerComponent} from "../../minigames/timer-stop/play/minigame-timer.component";
import {MinigameShapeSplitComponent} from "../../minigames/shape-split/play/minigame-shape-split.component";
import {MinigameTextAnswerComponent} from "../../minigames/text-answer/play/minigame-text-answer.component";
import {MinigameThesisComponent} from "../../minigames/thesis/play/minigame-thesis.component";
import {DrawingVotingComponent} from "../../minigames/drawing/voting/drawing-voting.component";
import {TextAnswerVotingComponent} from "../../minigames/text-answer/voting/text-answer-voting.component";
import {StickerPlaceResultComponent} from "../../minigames/sticker-place/result/sticker-place-result.component";
import {DrawingResultComponent} from "../../minigames/drawing/result/drawing-result.component";
import {ChoiceResultComponent} from "../../minigames/choice/result/choice-result.component";
import {NumberResultComponent} from "../../minigames/number/result/number-result.component";
import {TimerStopResultComponent} from "../../minigames/timer-stop/result/timer-stop-result.component";
import {ShapeSplitResultComponent} from "../../minigames/shape-split/result/shape-split-result.component";
import {TextAnswerResultComponent} from "../../minigames/text-answer/result/text-answer-result.component";
import {ThesisResultComponent} from "../../minigames/thesis/result/thesis-result.component";

interface TaskItem {id: string; type: string; title: string; durationSec: number; [key: string]: any}
interface SimPlayer {id: string; name: string}

@Component({
  selector: "app-minigame-editor",
  standalone: true,
  imports: [
    CommonModule,
    StickerBoardComponent, DrawingCanvasBgComponent,
    MinigameChoiceComponent, MinigameNumberComponent, MinigameTimerComponent,
    MinigameShapeSplitComponent, MinigameTextAnswerComponent, MinigameThesisComponent,
    DrawingVotingComponent, TextAnswerVotingComponent,
    StickerPlaceResultComponent, DrawingResultComponent, ChoiceResultComponent,
    NumberResultComponent, TimerStopResultComponent, ShapeSplitResultComponent,
    TextAnswerResultComponent, ThesisResultComponent,
  ],
  templateUrl: "./minigame-editor.component.html",
  host: {"class": "h-dvh flex flex-col bg-neutral-100"},
})
export class MinigameEditorComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly tasks = signal<TaskItem[]>([]);
  readonly selectedIndex = signal<number | null>(null);
  readonly loadingTasks = signal(false);
  readonly taskError = signal<string | null>(null);

  readonly selectedTask = computed(() => {
    const i = this.selectedIndex();
    if (i === null) return null;
    return this.tasks()[i] ?? null;
  });

  readonly selectedHandler = computed(() => {
    const t = this.selectedTask();
    if (!t) return null;
    return minigameRegistry.getHandler(t.type);
  });

  readonly players = signal<SimPlayer[]>([
    {id: "p1", name: "Alice"},
    {id: "p2", name: "Bob"},
  ]);
  readonly activePlayerIndex = signal(0);
  readonly renderKey = signal(1);
  readonly newPlayerName = signal("");
  readonly renamingIdx = signal<number | null>(null);
  readonly renameValue = signal("");

  readonly submissions = signal<Record<string, MinigameSubmission | null>>({});
  readonly results = signal<StickerCollageVoteResult[] | null>(null);
  readonly winnerId = signal<string | null>(null);
  readonly tiedWinnerIds = signal<string[]>([]);

  readonly activePlayer = computed(() => {
    const i = this.activePlayerIndex();
    const p = this.players();
    return p[i >= 0 && i < p.length ? i : 0];
  });

  readonly hasSubmissionForActive = computed(() => {
    const p = this.activePlayer();
    if (!p) return false;
    return this.submissions()[p.id] !== null && this.submissions()[p.id] !== undefined;
  });

  readonly submissionCount = computed(() => {
    const subs = this.submissions();
    return this.players().filter(p => subs[p.id] !== null && subs[p.id] !== undefined).length;
  });

  readonly board = viewChild<StickerBoardComponent>("stickerBoard");
  readonly canvas = viewChild<DrawingCanvasBgComponent>("drawingCanvas");
  readonly choice = viewChild<MinigameChoiceComponent>("choiceCmp");
  readonly number = viewChild<MinigameNumberComponent>("numberCmp");
  readonly timer = viewChild<MinigameTimerComponent>("timerCmp");
  readonly split = viewChild<MinigameShapeSplitComponent>("splitCmp");
  readonly text = viewChild<MinigameTextAnswerComponent>("textCmp");
  readonly thesis = viewChild<MinigameThesisComponent>("thesisCmp");

  async ngOnInit() {
    await this.loadTasks();
  }

  async loadTasks() {
    this.loadingTasks.set(true);
    this.taskError.set(null);
    try {
      const data = await firstValueFrom(this.http.get<TaskItem[]>("/api/game-config/tasks"));
      this.tasks.set(data);
    } catch {
      this.taskError.set("Tasks konnten nicht geladen werden.");
    } finally {
      this.loadingTasks.set(false);
    }
  }

  selectTask(idx: number) {
    this.selectedIndex.set(idx);
    this.resetAllSubmissions();
    this.renderKey.update(k => k + 1);
  }

  setActivePlayer(idx: number) {
    if (idx === this.activePlayerIndex()) return;
    this.activePlayerIndex.set(idx);
    this.renderKey.update(k => k + 1);
  }

  addPlayer() {
    const name = this.newPlayerName().trim() || `Spieler ${this.players().length + 1}`;
    const id = `p${Date.now()}`;
    this.players.update(p => [...p, {id, name}]);
    this.newPlayerName.set("");
  }

  removePlayer(idx: number) {
    const p = this.players();
    if (p.length <= 1) return;
    const player = p[idx];
    this.players.update(arr => arr.filter((_, i) => i !== idx));
    this.submissions.update(s => {
      const copy = {...s};
      delete copy[player.id];
      return copy;
    });
    if (this.activePlayerIndex() >= this.players().length) {
      this.activePlayerIndex.set(this.players().length - 1);
    }
    this.renderKey.update(k => k + 1);
  }

  startRename(idx: number) {
    this.renamingIdx.set(idx);
    this.renameValue.set(this.players()[idx]?.name ?? "");
  }

  commitRename() {
    const idx = this.renamingIdx();
    if (idx === null) return;
    const name = this.renameValue().trim();
    if (name) {
      this.players.update(p => p.map((pl, i) => i === idx ? {...pl, name} : pl));
    }
    this.renamingIdx.set(null);
  }

  cancelRename() {
    this.renamingIdx.set(null);
  }

  submitForActivePlayer() {
    const t = this.selectedTask();
    const player = this.activePlayer();
    if (!t || !player) return;

    const submission = this.captureSubmission(t);
    if (!submission) return;

    this.submissions.update(s => ({...s, [player.id]: submission}));
    this.renderKey.update(k => k + 1);
  }

  private captureSubmission(task: TaskItem): MinigameSubmission | null {
    const player = this.activePlayer();
    const now = Date.now();
    const pid = player.id;

    switch (task.type) {
      case "sticker-place": {
        const pos = this.board()?.getPositions();
        if (!pos || pos.length === 0) return null;
        return {type: "sticker-place", playerId: pid, roundIndex: 1, positions: pos, submittedAt: now};
      }
      case "drawing": {
        const dataUrl = this.canvas()?.painter?.toDataURL();
        if (!dataUrl) return null;
        return {type: "drawing", playerId: pid, roundIndex: 1, imageDataUrl: dataUrl, submittedAt: now};
      }
      case "choice": {
        const sel = this.choice()?.selected();
        if (!sel || sel.length === 0) return null;
        return {type: "choice", playerId: pid, roundIndex: 1, selectedIndices: sel, submittedAt: now};
      }
      case "number": {
        const val = this.number()?.value();
        if (val === undefined) return null;
        return {type: "number", playerId: pid, roundIndex: 1, value: val, submittedAt: now};
      }
      case "timer-stop": {
        const elapsed = this.lastTimerElapsed();
        if (elapsed === null) return null;
        this.lastTimerElapsed.set(null);
        return {type: "timer-stop", playerId: pid, roundIndex: 1, elapsedSec: elapsed, submittedAt: now};
      }
      case "shape-split": {
        const cmp = this.split();
        if (!cmp) return null;
        return {
          type: "shape-split", playerId: pid, roundIndex: 1,
          cutLine: {a: cmp.handleA(), b: cmp.handleB()},
          areaFraction: cmp.areaFraction(), submittedAt: now,
        };
      }
      case "text-answer": {
        const ans = this.text()?.answer();
        if (!ans || !ans.trim()) return null;
        return {type: "text-answer", playerId: pid, roundIndex: 1, answer: ans.trim(), submittedAt: now};
      }
      case "thesis": {
        const cmp = this.thesis();
        if (!cmp || cmp.agreed() === null) return null;
        return {
          type: "thesis", playerId: pid, roundIndex: 1,
          agreed: cmp.agreed()!, estimatedPercent: cmp.estimatedPercent(), submittedAt: now,
        };
      }
      default: return null;
    }
  }

  readonly lastTimerElapsed = signal<number | null>(null);

  onTimerSubmitted(elapsedSec: number) {
    this.lastTimerElapsed.set(elapsedSec);
  }

  onSubmitClick() {
    const t = this.selectedTask();
    if (!t) return;
    switch (t.type) {
      case "sticker-place": this.submitForActivePlayer(); break;
      case "drawing": this.submitForActivePlayer(); break;
      case "choice": this.choice()?.submit(); break;
      case "number": this.number()?.submit(); break;
      case "timer-stop": this.timer()?.submit(); break;
      case "shape-split": this.submitForActivePlayer(); break;
      case "text-answer": this.text()?.submit(); break;
      case "thesis": this.submitForActivePlayer(); break;
    }
  }

  onChildSubmitted(_data: any) {
    this.submitForActivePlayer();
  }

  evaluate() {
    const t = this.selectedTask();
    const handler = this.selectedHandler();
    if (!t || !handler) return;

    const subs = this.submissions();
    const validSubs = Object.values(subs).filter(s => s !== null) as MinigameSubmission[];
    if (validSubs.length === 0) return;

    const placeholderCollages: StickerCollage[] = validSubs.map(s => ({
      id: `mg_${s.playerId}_1`,
      playerId: s.playerId,
      roundIndex: 1,
      placements: [],
      submittedAt: s.submittedAt,
      snapshotUrl: handler.getSnapshotSvg(s) ?? undefined,
    }));

    const scored = handler.evaluateSubmissions(validSubs as any, placeholderCollages, t as any);
    this.results.set(scored.results);
    this.winnerId.set(scored.winnerId);
    this.tiedWinnerIds.set(scored.tiedWinnerIds);
  }

  getResultText(playerId: string): string {
    const t = this.selectedTask();
    const handler = this.selectedHandler();
    if (!t || !handler) return "";
    const subs = this.submissions();
    const allValid = Object.values(subs).filter(s => s !== null) as MinigameSubmission[];
    const my = subs[playerId] ?? undefined;
    return handler.getResultSummary(my as any, allValid as any, t as any);
  }

  getPlacement(playerId: string): number | null {
    const r = this.results();
    if (!r) return null;
    return r.find(e => e.playerId === playerId)?.placement ?? null;
  }

  isWinner(playerId: string): boolean {
    return this.winnerId() === playerId || this.tiedWinnerIds().includes(playerId);
  }

  resetAllSubmissions() {
    this.submissions.set({});
    this.results.set(null);
    this.winnerId.set(null);
    this.tiedWinnerIds.set([]);
    this.lastTimerElapsed.set(null);
  }

  onPlayerNameInput(event: Event) {
    this.newPlayerName.set((event.target as HTMLInputElement).value);
  }

  description(): string {
    const t = this.selectedTask();
    const h = this.selectedHandler();
    if (!t || !h) return "";
    return h.getDescription(t as any);
  }

  readonly simulatedVotes = signal<Record<string, string[]>>({});

  getVotingEntries(): Array<{submission: MinigameSubmission; playerName: string; snapshotUrl: string | null}> {
    const handler = this.selectedHandler();
    if (!handler) return [];
    const subs = this.submissions();
    return this.players()
      .filter(p => subs[p.id] !== null && subs[p.id] !== undefined)
      .map(p => ({
        submission: subs[p.id]!,
        playerName: p.name,
        snapshotUrl: handler.getSnapshotSvg(subs[p.id]!) ?? null,
      }));
  }

  getTextAnswerEntries(): Array<{submission: any; playerName: string}> {
    const subs = this.submissions();
    return this.players()
      .filter(p => subs[p.id] !== null && subs[p.id] !== undefined)
      .filter(p => (subs[p.id] as any)?.type === 'text-answer')
      .map(p => ({
        submission: subs[p.id]!,
        playerName: p.name,
      }));
  }

  onVoteCast(playerId: string) {
    this.simulatedVotes.update(v => {
      const prev = v['simulated'] ?? [];
      if (prev.includes(playerId)) {
        return {...v, simulated: prev.filter(id => id !== playerId)};
      }
      return {...v, simulated: [...prev, playerId]};
    });
  }

  getAllSubsForType(_type: string): MinigameSubmission[] {
    const subs = this.submissions();
    return Object.values(subs).filter(s => s !== null) as MinigameSubmission[];
  }
}
