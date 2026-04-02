import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from "@angular/core";
import type { DrawSearchDrawing, DrawSearchGamePhase } from "@birthday/shared";
import { WorldStore } from "../../../core/world.store";
import { FramedDrawingComponent } from "../shared/framed-drawing.component";

/** Base size of each drawing slot in the logical scene (px). */
const SLOT_SIZE = 160;
/** Extra padding between slots. */
const SLOT_GAP = 20;

interface ScatteredItem {
  drawing: DrawSearchDrawing;
  x: number;
  y: number;
}

@Component({
  selector: "app-board-scene",
  standalone: true,
  imports: [CommonModule, FramedDrawingComponent],
  templateUrl: "./museum-scene.component.html",
})
export class MuseumSceneComponent implements AfterViewInit, OnDestroy {
  public readonly worldStore = inject(WorldStore);

  @ViewChild("sceneContainer") sceneContainerRef?: ElementRef<HTMLElement>;

  public readonly containerWidth = signal(800);
  public readonly containerHeight = signal(600);

  private resizeObserver?: ResizeObserver;

  // ...existing code...
  public readonly modeState = computed(() => this.worldStore.drawSearchModeState());
  public readonly phase = computed<DrawSearchGamePhase>(() => this.modeState()?.phase ?? "LOBBY");

  public readonly drawingsList = computed<DrawSearchDrawing[]>(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });

  public readonly drawingCount = computed(() => this.drawingsList().length);
  public readonly leaderboard = computed(() => this.worldStore.leaderboard());

  /**
   * Lay drawings out on a loose grid with small random offsets.
   * Returns items with logical (x,y) positions in a scene coordinate system.
   */
  public readonly scatteredDrawings = computed<ScatteredItem[]>(() => {
    const drawings = this.drawingsList();
    if (drawings.length === 0) return [];

    const step = SLOT_SIZE + SLOT_GAP;
    // Determine grid columns: aim for roughly square layout
    const cols = Math.max(1, Math.ceil(Math.sqrt(drawings.length)));

    return drawings.map((drawing, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const hash = this.hashCode(drawing.id);
      // Small scatter offset: ±12px
      const jitterX = -12 + (hash % 25);
      const jitterY = -12 + ((hash >> 5) % 25);
      return {
        drawing,
        x: col * step + jitterX,
        y: row * step + jitterY,
      };
    });
  });

  /** Bounding box of all scattered items in logical px. */
  public readonly sceneSize = computed(() => {
    const items = this.scatteredDrawings();
    if (items.length === 0) return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
    let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
    for (const item of items) {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + SLOT_SIZE);
      maxY = Math.max(maxY, item.y + SLOT_SIZE);
    }
    return { width: maxX - minX, height: maxY - minY, offsetX: minX, offsetY: minY };
  });

  /** CSS scale factor to fit all drawings into the visible container. */
  public readonly sceneCssScale = computed(() => {
    const scene = this.sceneSize();
    if (scene.width === 0 || scene.height === 0) return 1;
    const pad = 32; // padding on each side
    const availW = this.containerWidth() - pad * 2;
    const availH = this.containerHeight() - pad * 2;
    const scale = Math.min(1, availW / scene.width, availH / scene.height);
    return scale;
  });

  public ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.containerWidth.set(entry.contentRect.width);
        this.containerHeight.set(entry.contentRect.height);
      }
    });
    const el = this.sceneContainerRef?.nativeElement;
    if (el) {
      this.resizeObserver.observe(el);
      this.containerWidth.set(el.clientWidth);
      this.containerHeight.set(el.clientHeight);
    }
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  public playerName(playerId: string): string {
    return this.worldStore.players()[playerId]?.name ?? "Unbekannt";
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
}
