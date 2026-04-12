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
 * Dragging from the palette immediately creates a real StickerPlacement
 * on the canvas. If the pointer is released outside the canvas area,
 * the sticker is removed with a disappear animation.
 */

import gsap from 'gsap';
import {StickerCanvasComponent} from './sticker-canvas/sticker-canvas.component';
import {StickerDragStartEvent, StickerPaletteComponent} from './sticker-palette/sticker-palette.component';
import {AnimOnInitDirective} from '../../../shared/animations/anim-on-init.directive';
import {animateStickerRemoval} from './sticker-canvas/sticker-removal-animation';

@Component({
    selector: "app-sticker-editor",
    standalone: true,
    imports: [CommonModule, StickerCanvasComponent, StickerPaletteComponent, StickerCanvasComponent, AnimOnInitDirective],
    templateUrl: "./sticker-editor.component.html",
    host: {"class": "flex flex-col"},
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

    // ── Palette drag → instant sticker creation ───────────────────

    /** Tracks cleanup for an ongoing palette-initiated drag. */
    private paletteDragCleanup: (() => void) | null = null;
    private readonly removingIds = new Set<string>();

    public onStickerDragStarted(event: StickerDragStartEvent): void {
        if (!this.canAddMore()) return;

        const canvasEl = this.stickerCanvas?.canvasNativeElement;
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();

        // Place sticker at the exact pointer position (canvas-local coords).
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const current = this.placements();
        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;

        const newPlacement: StickerPlacement = {
            instanceId: this.stickerCanvas?.generateInstanceId()
                ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId: event.stickerId,
            x,
            y,
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        };

        const newPlacements = [...current, newPlacement];
        this.placements.set(newPlacements);
        this.placementsChanged.emit(newPlacements);

        // Cache the rendered size so the overlay is correct before <img> loads
        this.stickerCanvas.cacheRenderedSize(
            newPlacement.instanceId,
            event.renderedWidth,
            event.renderedHeight,
        );

        // Select the freshly created sticker
        this.stickerCanvas.selectedInstanceId.set(newPlacement.instanceId);
        this.stickerCanvas.lassoSelection.set(new Set());

        // ── Animate the sticker in (same as old ghost: scale 0.3→1) ──
        requestAnimationFrame(() => {
            const wrapper = canvasEl.querySelector<HTMLElement>(
                `[data-removal-wrapper-for="${newPlacement.instanceId}"]`,
            );
            const img = wrapper?.querySelector('img');
            if (img) {
                gsap.fromTo(img,
                    {scale: 0.3, transformOrigin: '50% 50%'},
                    {scale: 1, duration: 0.18, ease: 'back.out(1.5)', overwrite: true,
                     onComplete: () => { gsap.set(img, {clearProps: 'transform,transformOrigin'}); }},
                );
            }
        });

        // ── Drive move via window-level pointer events ───────────
        const instanceId = newPlacement.instanceId;
        let lastClientX = event.clientX;
        let lastClientY = event.clientY;
        let stickerX = newPlacement.x;
        let stickerY = newPlacement.y;

        // The delete zone only appears after the sticker entered the canvas once
        let wasInsideCanvas = false;

        const isOutside = (evClientX: number, evClientY: number, r: DOMRect): boolean => {
            // Pointer outside canvas?
            const pointerOut = evClientX < r.left || evClientX > r.right ||
                               evClientY < r.top  || evClientY > r.bottom;
            if (pointerOut) return true;
            // Sticker centroid outside canvas?
            return stickerX < 0 || stickerX > r.width || stickerY < 0 || stickerY > r.height;
        };

        const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== event.pointerId) return;
            ev.preventDefault();
            const r = canvasEl.getBoundingClientRect();

            const dx = ev.clientX - lastClientX;
            const dy = ev.clientY - lastClientY;
            lastClientX = ev.clientX;
            lastClientY = ev.clientY;
            stickerX += dx;
            stickerY += dy;

            const outside = isOutside(ev.clientX, ev.clientY, r);
            if (!outside) wasInsideCanvas = true;

            const updated = this.placements().map(p =>
                p.instanceId === instanceId
                    ? {...p, x: stickerX, y: stickerY}
                    : p,
            );
            this.placements.set(updated);
            this.placementsChanged.emit(updated);

            this.stickerCanvas.dragNearEdge.set(wasInsideCanvas && outside);
            this.stickerCanvas.isMoveActive.set(true);
        };

        const onUp = (ev: PointerEvent) => {
            if (ev.pointerId !== event.pointerId) return;
            cleanup();
            const r = canvasEl.getBoundingClientRect();
            const outside = isOutside(ev.clientX, ev.clientY, r);

            this.stickerCanvas.dragNearEdge.set(false);
            this.stickerCanvas.isMoveActive.set(false);

            if (outside) {
                // Released outside canvas → animate removal
                this.stickerCanvas.selectedInstanceId.set(null);
                this.stickerCanvas.lassoSelection.set(new Set());
                animateStickerRemoval([instanceId], canvasEl, this.removingIds, () => {
                    const updated = this.placements().filter(p => p.instanceId !== instanceId);
                    this.placements.set(updated);
                    this.placementsChanged.emit(updated);
                });
            } else {
                // Successfully placed — push to undo stack
                this.stickerCanvas.undo.push(this.placements());
            }
        };

        const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            this.paletteDragCleanup = null;
        };

        // Clean up any previous drag
        this.paletteDragCleanup?.();

        window.addEventListener('pointermove', onMove, {passive: false});
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        this.paletteDragCleanup = cleanup;
    }

    // ── Canvas event handlers ─────────────────────────────────────

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
