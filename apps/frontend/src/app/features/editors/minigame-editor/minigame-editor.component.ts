import {Component, signal, computed, inject, OnInit} from "@angular/core";
import {CommonModule} from "@angular/common";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {StickerBoardComponent} from "../../shared/sticker-board/sticker-board.component";
import {DrawingCanvasBgComponent} from "../../shared/drawing-canvas-bg/drawing-canvas-bg.component";
import {MinigameChoiceComponent} from "../../shared/minigame-choice/minigame-choice.component";
import {MinigameNumberComponent} from "../../shared/minigame-number/minigame-number.component";
import {MinigameTimerComponent} from "../../shared/minigame-timer/minigame-timer.component";
import {MinigameShapeSplitComponent} from "../../shared/minigame-shape-split/minigame-shape-split.component";

interface SpriteEntry {id: string; spriteRef: string}
interface TaskItem {_index?: number; type: string; title: string; durationSec: number; [key: string]: any}
interface OptionItem {label: string; emoji?: string}
interface PointItem {x: number; y: number}

@Component({
  selector: "app-minigame-editor",
  standalone: true,
  imports: [
    CommonModule,
    StickerBoardComponent, DrawingCanvasBgComponent,
    MinigameChoiceComponent, MinigameNumberComponent, MinigameTimerComponent,
    MinigameShapeSplitComponent,
  ],
  templateUrl: "./minigame-editor.component.html",
  host: {"class": "h-dvh flex flex-col bg-neutral-50"},
})
export class MinigameEditorComponent implements OnInit {
  private readonly http = inject(HttpClient);

  // ─── State ──────────────────────────────────────────────────
  readonly tasks = signal<TaskItem[]>([]);
  readonly sprites = signal<SpriteEntry[]>([]);
  readonly selectedIndex = signal<number | null>(null);
  readonly selectedType = signal("choice");
  readonly loading = signal(false);
  readonly saved = signal(false);
  readonly deleted = signal(false);
  readonly error = signal<string | null>(null);

  // Form state
  readonly title = signal("");
  readonly durationSec = signal(45);
  readonly stickerSvg = signal("");
  readonly backgroundSvg = signal("");
  readonly targetSec = signal(5);
  readonly numberMin = signal(1);
  readonly numberMax = signal(100);
  readonly numberDefault = signal(50);
  readonly options = signal<OptionItem[]>([]);
  readonly targetFraction = signal(50);

  readonly newOptionLabel = signal("");
  readonly newOptionEmoji = signal("");

  // ─── Computed ──────────────────────────────────────────────
  readonly isNew = computed(() => this.selectedIndex() === null);
  readonly taskJson = computed(() => JSON.stringify(this.buildTask(), null, 2));

  // ─── Lifecycle ─────────────────────────────────────────────
  async ngOnInit() {
    await Promise.all([this.loadTasks(), this.loadSprites()]);
  }

  async loadTasks() {
    try {
      const data = await firstValueFrom(this.http.get<TaskItem[]>("/api/game-config/tasks"));
      this.tasks.set(data);
    } catch { this.error.set("Tasks konnten nicht geladen werden"); }
  }

  async loadSprites() {
    try {
      const data = await firstValueFrom(this.http.get<SpriteEntry[]>("/api/sprite-ids"));
      this.sprites.set(data);
    } catch {}
  }

  toNum(v: any): number { return Number(v) || 0; }

  readonly showPreview = signal(false);

  readonly previewTask = computed(() => this.buildTask());

  togglePreview() { this.showPreview.update(v => !v); }
  selectTask(index: number) {
    const task = this.tasks()[index];
    if (!task) return;
    this.selectedIndex.set(index);
    this.title.set(task['title'] ?? "");
    this.durationSec.set(task['durationSec'] ?? 45);
    this.selectedType.set(task['type'] ?? "choice");
    this.stickerSvg.set(task['stickerSvg'] ?? "");
    this.backgroundSvg.set(task['backgroundSvg'] ?? "");
    this.targetSec.set(task['targetSec'] ?? 5);
    this.numberMin.set(task['min'] ?? 1);
    this.numberMax.set(task['max'] ?? 100);
    this.numberDefault.set(task['default'] ?? 50);
    this.options.set((task['options'] ?? []).map((o: any) => ({label: o.label ?? "", emoji: o.emoji})));
    this.targetFraction.set(Math.round((task['targetFraction'] ?? 0.5) * 100));
  }

  newTask() {
    this.selectedIndex.set(null);
    this.title.set("");
    this.durationSec.set(45);
    this.selectedType.set("choice");
    this.stickerSvg.set("");
    this.backgroundSvg.set("");
    this.targetSec.set(5);
    this.numberMin.set(1);
    this.numberMax.set(100);
    this.numberDefault.set(50);
    this.options.set([]);
    this.targetFraction.set(50);
    this.error.set(null);
    this.saved.set(false);
  }

  // ─── Form helpers ──────────────────────────────────────────
  onTypeChange(e: Event) { this.selectedType.set((e.target as HTMLSelectElement).value); }

  addOption() {
    const label = this.newOptionLabel().trim();
    if (!label) return;
    this.options.update(o => [...o, {label, emoji: this.newOptionEmoji().trim() || undefined}]);
    this.newOptionLabel.set("");
    this.newOptionEmoji.set("");
  }

  removeOption(i: number) { this.options.update(o => o.filter((_, idx) => idx !== i)); }

  // ─── Save / Delete ─────────────────────────────────────────
  buildTask(): TaskItem {
    const task: TaskItem = {
      type: this.selectedType(),
      title: this.title(),
      durationSec: this.durationSec(),
    };
    if (this.stickerSvg()) task['stickerSvg'] = this.stickerSvg();
    if (this.backgroundSvg()) task['backgroundSvg'] = this.backgroundSvg();
    if (this.selectedType() === "timer-stop") task['targetSec'] = this.targetSec();
    if (this.selectedType() === "number") {
      task['min'] = this.numberMin();
      task['max'] = this.numberMax();
      task['default'] = this.numberDefault();
    }
    if (this.selectedType() === "choice") {
      task['options'] = this.options().map(o => ({label: o.label, ...(o.emoji ? {emoji: o.emoji} : {})}));
    }
    if (this.selectedType() === "shape-split") {
      task['targetFraction'] = this.targetFraction() / 100;
      const existing = this.isNew() ? null : this.tasks()[this.selectedIndex()!];
      if (existing?.['polygon']) task['polygon'] = existing['polygon'];
    }
    return task;
  }

  async save() {
    this.error.set(null);
    this.loading.set(true);
    try {
      const task = this.buildTask();
      if (this.isNew()) {
        await firstValueFrom(this.http.post("/api/game-config/tasks", {task}));
      } else {
        await firstValueFrom(this.http.put(`/api/game-config/tasks/${this.selectedIndex()}`, {task}));
      }
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2000);
      await this.loadTasks();
      this.newTask();
    } catch (err: any) {
      this.error.set(err?.message ?? "Speichern fehlgeschlagen");
    } finally {
      this.loading.set(false);
    }
  }

  async deleteTask(index: number) {
    if (!confirm("Task wirklich löschen?")) return;
    try {
      await firstValueFrom(this.http.delete(`/api/game-config/tasks/${index}`));
      await this.loadTasks();
      if (this.selectedIndex() === index) this.newTask();
      this.deleted.set(true);
      setTimeout(() => this.deleted.set(false), 2000);
    } catch (err: any) {
      this.error.set(err?.message ?? "Löschen fehlgeschlagen");
    }
  }
}
