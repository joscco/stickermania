import {
  Component,
  computed,
  input,
  output,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  inject,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement, StickerPack} from "@birthday/shared";
import {StickerCanvasComponent} from "./sticker-canvas/sticker-canvas.component";
import {StickerDragStartEvent, StickerPaletteComponent} from "./sticker-palette/sticker-palette.component";
import {AnimOnInitDirective} from "../animations/anim-on-init.directive";
import {PaletteDragSession} from "./palette-drag-session";

@Component({
  selector: "app-sticker-editor",
  standalone: true,
  imports: [CommonModule, StickerCanvasComponent, StickerPaletteComponent, AnimOnInitDirective],
  templateUrl: "./sticker-editor.component.html",
  host: {"class": "flex flex-col"},
})
export class StickerEditorComponent implements AfterViewInit, OnDestroy {

  readonly paletteStickers = input<StickerDefinition[]>([]);
  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly stickerPacks = input<StickerPack[]>([]);
  readonly maxStickers = input<number>(12);

  readonly placementsChanged = output<StickerPlacement[]>();

  @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;
  @ViewChild("canvasAreaEl") private canvasAreaEl!: ElementRef<HTMLDivElement>;

  readonly placements = signal<StickerPlacement[]>([]);
  readonly pendingDropPlacement = signal<StickerPlacement | null>(null);
  readonly allPlacements = computed(() => {
    const p = this.pendingDropPlacement();
    return p ? [...this.placements(), p] : this.placements();
  });
  readonly canAddMore = computed(() => this.placements().length < this.maxStickers());

  readonly canvasSizePx = signal(400);
  private resizeObserver?: ResizeObserver;

  private dragSession: PaletteDragSession | null = null;

  ngAfterViewInit(): void {
    let prevSize = this.canvasSizePx();

    this.resizeObserver = new ResizeObserver(([e]) => {
      const newSize = Math.min(e.contentRect.width, e.contentRect.height);
      if (prevSize !== newSize && prevSize > 0) {
        const ratio = newSize / prevSize;
        const scaled = this.placements().map(p => ({
          ...p,
          x: p.x * ratio,
          y: p.y * ratio,
        }));
        this.placements.set(scaled);
        this.placementsChanged.emit(scaled);
      }
      this.canvasSizePx.set(newSize);
      prevSize = newSize;
    });
    this.resizeObserver.observe(this.canvasAreaEl.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onStickerDragFromPaletteStarted(event: StickerDragStartEvent): void {
    if (!this.canAddMore()) return;

    const canvasEl = this.stickerCanvas?.canvasNativeElement;
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const instanceId = this.stickerCanvas.generateInstanceId();
    const placement: StickerPlacement = {
      instanceId,
      stickerId: event.stickerId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      rotation: 0,
      scale: 1,
      zIndex: 9500,
    };

    this.stickerCanvas.setAnimState(instanceId, 'entering');

    this.dragSession?.abort();

    this.stickerCanvas.paletteDragInProgress.set(true);
    this.stickerCanvas.stickerWouldBeDeleted.set(true);
    this.stickerCanvas.selectedInstanceId.set(instanceId);
    this.stickerCanvas.lassoSelection.set(new Set());

    this.dragSession = new PaletteDragSession({
      canvasEl,
      canvas: this.stickerCanvas,
      setPendingPlacement: (p) => this.pendingDropPlacement.set(p),
      onDrop: (id, outside, finalPlacement) => this.finalizeDrop(id, outside, finalPlacement),
    });

    this.dragSession.start(event, placement);
  }

  private finalizeDrop(instanceId: string, outside: boolean, finalPlacement: StickerPlacement): void {
    if (outside) {
      this.stickerCanvas.selectedInstanceId.set(null);
      this.stickerCanvas.lassoSelection.set(new Set());
      this.stickerCanvas.scheduleRemoval([instanceId], () => {});
    } else {
      const existing = this.placements();
      const maxZ = existing.length > 0
        ? Math.max(...existing.map(p => p.zIndex))
        : 0;
      const committed = {...finalPlacement, zIndex: maxZ + 1};
      const updated = [...existing, committed];
      this.placements.set(updated);
      this.placementsChanged.emit(updated);
      this.stickerCanvas.selectedInstanceId.set(instanceId);
      this.stickerCanvas.setAnimState(instanceId, 'settling');
    }
  }

  onPlacementsChanged(placements: StickerPlacement[]): void {
    this.placements.set(placements);
    this.placementsChanged.emit(placements);
  }

  onStickerRemoved(instanceId: string): void {
    const updated = this.placements().filter(p => p.instanceId !== instanceId);
    this.placements.set(updated);
    this.placementsChanged.emit(updated);
  }

  clearPlacements(): void {
    this.pendingDropPlacement.set(null);
    this.placements.set([]);
    this.placementsChanged.emit([]);
  }

  toDataUrl(): Promise<string> {
    return this.stickerCanvas.toDataUrl();
  }
}
