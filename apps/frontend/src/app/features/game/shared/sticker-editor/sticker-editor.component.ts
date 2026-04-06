import {
    Component,
    computed,
    Input,
    OnDestroy,
    Output,
    EventEmitter,
    signal,
    ViewChild,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement} from "@birthday/shared";
import {StickerPaletteComponent} from '../sticker-palette/sticker-palette.component';
import type {StickerDroppedEvent} from '../sticker-palette/sticker-palette.component';
import {StickerCanvasComponent} from '../sticker-canvas/sticker-canvas.component';

/**
 * Shared Sticker-Editor.
 *
 * Combines canvas + palette into one self-contained editor.
 * Used by:
 *  - PlayerBuildingComponent  (receives only the player's hand stickers)
 *  - StickerEditorTestComponent  (receives the full catalog)
 *
 * The canvas renders sticker images at h-16 (64 px). Drop coordinates are
 * corrected so the sticker centre lands exactly at the pointer release point,
 * matching the ghost visual.
 */

/** Base rendered size of a sticker on the canvas (matches `h-16` in the template). */
export const CANVAS_STICKER_PX = 64;

@Component({
    selector: "app-sticker-editor",
    standalone: true,
  imports: [CommonModule, StickerCanvasComponent, StickerPaletteComponent, StickerCanvasComponent],
    templateUrl: "./sticker-editor.component.html",
    host: {"class": "flex flex-col overflow-hidden"},
})
export class StickerEditorComponent implements OnDestroy {
    /** Stickers available in the palette (hand for player, full catalog for test editor). */
    @Input() paletteStickers: StickerDefinition[] = [];
    /** Full sticker catalog for image URL resolution. */
    @Input() stickerCatalog: StickerDefinition[] = [];
    @Input() maxStickers: number = 12;

    @Output() placementsChanged = new EventEmitter<StickerPlacement[]>();

    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

    public readonly placements = signal<StickerPlacement[]>([]);

    public readonly canAddMore = computed(() =>
        this.placements().length < this.maxStickers
    );

    // ── Drop handler ──────────────────────────────────────────────

    public onStickerDropped(event: StickerDroppedEvent): void {
        if (!this.canAddMore()) return;

        // Use the inner canvasArea element — same coordinate origin as sticker x/y placements
        const canvasEl = this.stickerCanvas?.canvasNativeElement;
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();

        // Ghost is centred on the pointer (transform: translate(-50%,-50%)).
        // The canvas places the sticker at (x, y) = top-left of its container div.
        // Subtract half the ghost's actual rendered size so the sticker's visual
        // centre lands exactly at the pointer release point — no jump.
        const x = event.clientX - rect.left  - event.renderedWidth  / 2;
        const y = event.clientY - rect.top   - event.renderedHeight / 2;

        const current = this.placements();
        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;

        const newPlacements = [...current, {
            instanceId: this.stickerCanvas?.generateInstanceId()
                ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId: event.stickerId,
            x: Math.max(0, x),
            y: Math.max(0, y),
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        }];

        this.placements.set(newPlacements);
        this.placementsChanged.emit(newPlacements);
    }

    public onPlacementsChanged(placements: StickerPlacement[]): void {
        this.placements.set(placements);
        this.placementsChanged.emit(placements);
    }

    public onStickerRemoved(instanceId: string): void {
        const updated = this.placements().filter(p => p.instanceId !== instanceId);
        this.placements.set(updated);
        this.placementsChanged.emit(updated);
    }

    public clearPlacements(): void {
        this.placements.set([]);
        this.placementsChanged.emit([]);
    }

    /** Render the canvas to a PNG data URL (delegates to StickerCanvasComponent). */
    public toDataUrl(): Promise<string> {
        return this.stickerCanvas.toDataUrl();
    }

    ngOnDestroy(): void {}
}

