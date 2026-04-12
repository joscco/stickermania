import {
    Component,
    computed,
    input,
    NgZone,
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

    constructor(private readonly zone: NgZone) {}

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
        // No clamping — the canvas has overflow:visible + z-10, so the sticker
        // is visible even when the pointer starts in the palette below.
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
        // Animate the <img> inside, NOT the wrapper div, because the wrapper
        // uses transform-origin:0 0 + translate(-50%,-50%) for positioning.
        // GSAP inline styles on the wrapper would break that pivot permanently.
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
        // Use the raw pointer position as "anchor" so the delta between
        // pointer movement and sticker movement stays 1:1 from the start.
        // baseX/baseY is the clamped position where the sticker was placed.
        let lastClientX = event.clientX;
        let lastClientY = event.clientY;
        let stickerX = newPlacement.x;
        let stickerY = newPlacement.y;

        // Track whether the sticker has been inside the canvas at least once.
        // The delete zone only appears after the user dragged it in and then out again,
        // not while they're still pulling it up from the palette.
        let wasInsideCanvas = false;

        const onMove = (ev: PointerEvent) => {
            ev.preventDefault();
            const r = canvasEl.getBoundingClientRect();

            // Incremental delta from last pointer position
            const dx = ev.clientX - lastClientX;
            const dy = ev.clientY - lastClientY;
            lastClientX = ev.clientX;
            lastClientY = ev.clientY;
            stickerX += dx;
            stickerY += dy;

            const outside = ev.clientX < r.left || ev.clientX > r.right ||
                            ev.clientY < r.top  || ev.clientY > r.bottom;

            if (!outside) wasInsideCanvas = true;

            this.zone.run(() => {
                const updated = this.placements().map(p =>
                    p.instanceId === instanceId
                        ? {...p, x: stickerX, y: stickerY}
                        : p,
                );
                this.placements.set(updated);
                this.placementsChanged.emit(updated);

                // Show drag-near-edge / delete zone only after sticker was inside canvas once
                this.stickerCanvas.dragNearEdge.set(wasInsideCanvas && outside);
                this.stickerCanvas.isMoveActive.set(true);
            });
        };

        const onUp = (ev: PointerEvent) => {
            cleanup();
            const r = canvasEl.getBoundingClientRect();
            const outside = ev.clientX < r.left || ev.clientX > r.right ||
                            ev.clientY < r.top  || ev.clientY > r.bottom;

            this.zone.run(() => {
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
            });
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
