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
    const updated = [...this.placements(), placement];
    this.placements.set(updated);
    this.placementsChanged.emit(updated);

    this.dragSession?.abort();

    this.stickerCanvas.paletteDragInProgress.set(true);
    this.stickerCanvas.stickerWouldBeDeleted.set(true);
    this.stickerCanvas.selectedInstanceId.set(instanceId);
    this.stickerCanvas.lassoSelection.set(new Set());

    this.dragSession = new PaletteDragSession({
      canvasEl,
      canvas: this.stickerCanvas,
      getPlacements: () => this.placements(),
      updatePlacements: (p) => {
        this.placements.set(p);
        this.placementsChanged.emit(p);
      },
      onDrop: (id, outside) => this.finalizeDrop(id, outside),
    });

    this.dragSession.start(event, placement);
  }

  private finalizeDrop(instanceId: string, outside: boolean): void {
    if (outside) {
      this.stickerCanvas.selectedInstanceId.set(null);
      this.stickerCanvas.lassoSelection.set(new Set());
      this.stickerCanvas.scheduleRemoval([instanceId], () => {
        const updated = this.placements().filter(p => p.instanceId !== instanceId);
        this.placements.set(updated);
        this.placementsChanged.emit(updated);
      });
    } else {
      const others = this.placements().filter(p => p.instanceId !== instanceId);
      const normalZ = others.length > 0
        ? Math.max(...others.map(p => p.zIndex)) + 1
        : 1;
      const normalized = this.placements().map(p =>
        p.instanceId === instanceId ? {...p, zIndex: normalZ} : p,
      );
      this.placements.set(normalized);
      this.placementsChanged.emit(normalized);
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
    this.placements.set([]);
    this.placementsChanged.emit([]);
  }

  toDataUrl(): Promise<string> {
    return this.stickerCanvas.toDataUrl();
  }
}
