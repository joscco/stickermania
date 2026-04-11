import {
    Component,
    computed,
    input,
    output,
    signal,
    ViewChild,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition, StickerPlacement} from "@birthday/shared";

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

import {StickerCanvasComponent} from './sticker-canvas/sticker-canvas.component';
import {StickerDroppedEvent, StickerPaletteComponent} from './sticker-palette/sticker-palette.component';

@Component({
    selector: "app-sticker-editor",
    standalone: true,
  imports: [CommonModule, StickerCanvasComponent, StickerPaletteComponent, StickerCanvasComponent],
    templateUrl: "./sticker-editor.component.html",
    host: {"class": "flex flex-col overflow-hidden"},
})
export class StickerEditorComponent {
    // ── Inputs / Outputs ──────────────────────────────────────────
    /** Stickers available in the palette (player hand or full catalog). */
    readonly paletteStickers  = input<StickerDefinition[]>([]);
    /** Full catalog for image URL resolution in the canvas. */
    readonly stickerCatalog   = input<StickerDefinition[]>([]);
    readonly maxStickers      = input<number>(12);

    readonly placementsChanged = output<StickerPlacement[]>();

    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

    public readonly placements = signal<StickerPlacement[]>([]);
    public readonly canAddMore = computed(() => this.placements().length < this.maxStickers());

    // ── Drop handler ──────────────────────────────────────────────

    public onStickerDropped(event: StickerDroppedEvent): void {
        if (!this.canAddMore()) return;

        // Use the inner canvasArea element — same coordinate origin as sticker x/y placements
        const canvasEl = this.stickerCanvas?.canvasNativeElement;
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();

        // x/y = visual center of the sticker on the canvas.
        // The ghost is centred on the pointer, so pointer position = desired center.
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const current = this.placements();
        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;

        const newPlacement = {
            instanceId: this.stickerCanvas?.generateInstanceId()
                ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId: event.stickerId,
            x: Math.max(0, x),
            y: Math.max(0, y),
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        };

        const newPlacements = [...current, newPlacement];
        this.placements.set(newPlacements);
        this.placementsChanged.emit(newPlacements);

        // Cache the rendered size from the palette ghost so the overlay is correct
        // before the canvas <img> has finished loading
        this.stickerCanvas.cacheRenderedSize(
            newPlacement.instanceId,
            event.renderedWidth,
            event.renderedHeight,
        );

        // Select the freshly dropped sticker, clear any previous selection
        this.stickerCanvas.selectedInstanceId.set(newPlacement.instanceId);
        this.stickerCanvas.lassoSelection.set(new Set());
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

}
