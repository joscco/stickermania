import {Component, signal, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {HttpClient} from "@angular/common/http";

interface Point {x: number; y: number}

const SVG_BACKGROUNDS = [
  {id: "", label: "Kein Hintergrund"},
  {id: "sprite:#sticker-shapes-heart", label: "Herz"},
  {id: "sprite:#sticker-shapes-star", label: "Stern"},
  {id: "sprite:#sticker-shapes-diamond", label: "Diamant"},
  {id: "sprite:#sticker-shapes-egg", label: "Ei"},
  {id: "sprite:#sticker-shapes-cloud", label: "Wolke"},
  {id: "sprite:#sticker-shapes-moon", label: "Mond"},
  {id: "sprite:#sticker-shapes-flower", label: "Blume"},
  {id: "sprite:#sticker-shapes-hexagon", label: "Sechseck"},
  {id: "sprite:#sticker-shapes-wobble", label: "Wobble"},
  {id: "sprite:#sticker-shapes-teardrop", label: "Träne"},
  {id: "sprite:#sticker-eyes-open", label: "Auge"},
  {id: "sprite:#sticker-mouths-smiling", label: "Mund"},
  {id: "sprite:#sticker-animals-pig-tail", label: "Schwein"},
  {id: "sprite:#sticker-noses-round", label: "Nase"},
];

/**
 * Shape-Split Editor: Define polygon shapes and target proportions
 * for the shape-split minigame. Export as MinigameTask JSON or save to config.
 */
@Component({
  selector: "app-shape-split-editor",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./shape-split-editor.component.html",
  host: {"class": "h-dvh flex flex-col bg-neutral-50"},
})
export class ShapeSplitEditorComponent {
  private readonly http = inject(HttpClient);

  // ─── State ──────────────────────────────────────────────────────
  readonly points = signal<Point[]>([]);
  readonly targetPercent = signal(50);
  readonly draggingIndex = signal<number | null>(null);
  readonly showPreview = signal(true);
  readonly copied = signal(false);
  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly title = signal("Teile die Fläche!");
  readonly selectedBg = signal("");

  readonly viewBox = {minX: 0, maxX: 200, minY: 0, maxY: 200};
  readonly backgrounds = SVG_BACKGROUNDS;

  // ─── Computed ───────────────────────────────────────────────────
  readonly polygonPath = computed(() => {
    const pts = this.points();
    if (pts.length === 0) return "";
    const head = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    return head + " Z";
  });

  readonly polygonPoints = computed(() =>
    this.points().map(p => `${p.x},${p.y}`).join(" ")
  );

  readonly isClosed = computed(() => this.points().length >= 3);
  readonly canExport = computed(() => this.points().length >= 3);

  readonly exportJson = computed(() => {
    const pts = this.points();
    const task: Record<string, any> = {
      type: "shape-split",
      prompt: this.title(),
      durationSec: 45,
      polygon: pts.map(p => ({x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10})),
      targetFraction: Math.round(this.targetPercent()) / 100,
    };
    if (this.selectedBg()) {
      task['baseImageUrl'] = this.selectedBg();
    }
    return JSON.stringify(task, null, 2);
  });

  smallerTarget(): number {
    return Math.min(this.targetPercent(), 100 - this.targetPercent());
  }

  // ─── SVG Pointer Events ───────────────────────────────────────────
  onSvgClick(e: MouseEvent): void {
    if (this.draggingIndex() !== null) return;
    const svg = e.currentTarget as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const x = Math.max(0, Math.min(200, Math.round(loc.x * 10) / 10));
    const y = Math.max(0, Math.min(200, Math.round(loc.y * 10) / 10));

    const tooClose = this.points().some(p => Math.hypot(p.x - x, p.y - y) < 4);
    if (!tooClose) {
      this.points.update(pts => [...pts, {x, y}]);
    }
  }

  onPointDown(index: number, e: MouseEvent): void {
    e.stopPropagation();
    e.preventDefault();
    this.draggingIndex.set(index);
  }

  onSvgMove(e: MouseEvent): void {
    const idx = this.draggingIndex();
    if (idx === null) return;

    const svg = e.currentTarget as SVGSVGElement;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    const x = Math.max(0, Math.min(200, Math.round(loc.x * 10) / 10));
    const y = Math.max(0, Math.min(200, Math.round(loc.y * 10) / 10));

    this.points.update(pts => {
      const next = [...pts];
      next[idx] = {x, y};
      return next;
    });
  }

  onSvgUp(): void {
    this.draggingIndex.set(null);
  }

  onPointDblClick(index: number, e: MouseEvent): void {
    e.stopPropagation();
    this.points.update(pts => pts.filter((_, i) => i !== index));
  }

  // ─── Actions ────────────────────────────────────────────────────
  clearAll(): void {
    this.points.set([]);
  }

  removeLast(): void {
    this.points.update(pts => pts.slice(0, -1));
  }

  onTargetChange(e: Event): void {
    this.targetPercent.set(Number((e.target as HTMLInputElement).value));
  }

  onTitleChange(e: Event): void {
    this.title.set((e.target as HTMLInputElement).value);
  }

  onBgChange(e: Event): void {
    this.selectedBg.set((e.target as HTMLInputElement).value);
  }

  async copyJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.exportJson());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      const el = document.getElementById("json-output");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }

  async saveToConfig(): Promise<void> {
    this.saveError.set(null);
    try {
      const task = JSON.parse(this.exportJson());
      await this.http.post("/api/game-config/tasks", {task}).toPromise();
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2000);
    } catch (err: any) {
      this.saveError.set(err?.message ?? "Speichern fehlgeschlagen");
    }
  }

  onImport(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.polygon)) {
          this.points.set(data.polygon.map((p: any) => ({x: Number(p.x), y: Number(p.y)})));
        }
        if (typeof data.targetFraction === "number") {
          this.targetPercent.set(Math.round(data.targetFraction * 100));
        }
        if (typeof data.prompt === "string") {
          this.title.set(data.prompt);
        }
        if (typeof data.baseImageUrl === "string") {
          this.selectedBg.set(data.baseImageUrl);
        }
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
    input.value = "";
  }
}
