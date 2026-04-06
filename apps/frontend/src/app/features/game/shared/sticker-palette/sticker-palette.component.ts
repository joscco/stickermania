import {
    Component,
    ElementRef,
    Input,
    OnDestroy,
    Output,
    EventEmitter,
    signal,
} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition} from "@birthday/shared";
import {CANVAS_STICKER_PX} from '../sticker-editor/sticker-editor.component';

export interface StickerDroppedEvent {
    stickerId: string;
    /** clientX at the moment of drop */
    clientX: number;
    /** clientY at the moment of drop */
    clientY: number;
    /** Actual rendered width of the ghost image (px) — matches canvas rendering */
    renderedWidth: number;
    /** Actual rendered height of the ghost image (px) — matches canvas rendering */
    renderedHeight: number;
}

/**
 * Shared sticker palette.
 *
 * Shows a scrollable grid of sticker thumbnails. Each sticker starts a
 * pointer-driven ghost drag on pointerdown — no tap-to-add.
 *
 * The parent is responsible for:
 *  - providing `stickers` (the subset the player may use)
 *  - providing `dropTarget` (an ElementRef to the canvas wrapper element)
 *  - listening to `stickerDropped` and placing the sticker
 *
 * When the ghost is released outside `dropTarget` it disappears silently.
 */
@Component({
    selector: "app-sticker-palette",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-palette.component.html",
    host: {"class": "flex flex-col"},
})
export class StickerPaletteComponent implements OnDestroy {
    @Input() stickers: StickerDefinition[] = [];
    @Input() canAddMore: boolean = true;
    /** The canvas wrapper — accepts ElementRef OR a raw HTML element (template ref variable). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Input() dropTarget!: any;

    @Output() stickerDropped = new EventEmitter<StickerDroppedEvent>();

    public readonly activeDragId = signal<string | null>(null);

    private ghostEl: HTMLElement | null = null;
    private ghostImg: HTMLImageElement | null = null;
    private dragStickerId: string | null = null;
    private activePointerId: number | null = null;

    private boundMove = this.onGlobalMove.bind(this);
    private boundUp   = this.onGlobalUp.bind(this);

    private get canvasEl(): HTMLElement | null {
        if (!this.dropTarget) return null;
        // ElementRef has a nativeElement property; raw DOM elements don't
        return (this.dropTarget as ElementRef<HTMLElement>).nativeElement
            ?? (this.dropTarget as HTMLElement)
            ?? null;
    }

    public getStickerUrl(stickerId: string): string {
        return this.stickers.find(s => s.id === stickerId)?.imageUrl ?? "";
    }

    // ─── Pointer handlers (called from template) ──────────────────

    public onPointerDown(event: PointerEvent, sticker: StickerDefinition, thumbEl: HTMLElement): void {
        if (!this.canAddMore) return;
        if (event.button !== 0 && event.button !== undefined) return;

        event.preventDefault();

        this.dragStickerId   = sticker.id;
        this.activePointerId = event.pointerId;
        this.activeDragId.set(sticker.id);

        const {ghost, img} = this.createGhost(sticker.imageUrl, event.clientX, event.clientY);
        this.ghostEl  = ghost;
        this.ghostImg = img;

        try { thumbEl.setPointerCapture(event.pointerId); } catch {}

        window.addEventListener("pointermove",   this.boundMove, {passive: false});
        window.addEventListener("pointerup",     this.boundUp);
        window.addEventListener("pointercancel", this.boundUp);
    }

    // ─── Global pointer tracking ──────────────────────────────────

    private onGlobalMove(event: PointerEvent): void {
        if (event.pointerId !== this.activePointerId) return;
        event.preventDefault();
        if (!this.ghostEl) return;

        this.ghostEl.style.left = `${event.clientX}px`;
        this.ghostEl.style.top  = `${event.clientY}px`;

        const canvasEl = this.canvasEl;
        if (canvasEl) {
            const r = canvasEl.getBoundingClientRect();
            const over = event.clientX >= r.left && event.clientX <= r.right &&
                         event.clientY >= r.top  && event.clientY <= r.bottom;
            canvasEl.style.outline = over ? "3px solid #a855f7" : "";
        }
    }

    private onGlobalUp(event: PointerEvent): void {
        if (event.pointerId !== this.activePointerId) return;

        const canvasEl = this.canvasEl;
        if (canvasEl && this.dragStickerId) {
            const r = canvasEl.getBoundingClientRect();
            if (event.clientX >= r.left && event.clientX <= r.right &&
                event.clientY >= r.top  && event.clientY <= r.bottom) {
                // Use the actual rendered ghost image dimensions for precise centering
                const renderedWidth  = this.ghostImg?.offsetWidth  ?? CANVAS_STICKER_PX;
                const renderedHeight = this.ghostImg?.offsetHeight ?? CANVAS_STICKER_PX;
                this.stickerDropped.emit({
                    stickerId: this.dragStickerId,
                    clientX:   event.clientX,
                    clientY:   event.clientY,
                    renderedWidth,
                    renderedHeight,
                });
            }
        }

        this.cleanup(canvasEl ?? undefined);
    }

    // ─── Ghost helpers ─────────────────────────────────────────────

    /**
     * Creates a ghost that is visually identical to how the canvas renders the sticker:
     * height fixed at CANVAS_STICKER_PX (h-16 = 64 px), width auto-sized by the image's
     * natural aspect ratio — so there is zero size/shape jump on drop.
     */
    private createGhost(imageUrl: string, x: number, y: number): {ghost: HTMLElement; img: HTMLImageElement} {
        const ghost = document.createElement("div");
        ghost.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9999;
            transform: translate(-50%, -50%);
            filter: drop-shadow(0 6px 16px rgba(0,0,0,0.35));
            transition: none;
        `;
        const img = document.createElement("img");
        img.src = imageUrl;
        // Mirror exactly: height = CANVAS_STICKER_PX, width = auto (aspect-ratio preserved)
        img.style.cssText = `
            height: ${CANVAS_STICKER_PX}px;
            width: auto;
            display: block;
            pointer-events: none;
        `;
        img.draggable = false;
        ghost.appendChild(img);
        document.body.appendChild(ghost);
        ghost.style.left = `${x}px`;
        ghost.style.top  = `${y}px`;
        return {ghost, img};
    }

    private cleanup(canvasEl?: HTMLElement): void {
        this.ghostEl?.remove();
        this.ghostEl         = null;
        this.ghostImg        = null;
        this.dragStickerId   = null;
        this.activePointerId = null;
        this.activeDragId.set(null);
        if (canvasEl) canvasEl.style.outline = "";
        window.removeEventListener("pointermove",   this.boundMove);
        window.removeEventListener("pointerup",     this.boundUp);
        window.removeEventListener("pointercancel", this.boundUp);
    }

    ngOnDestroy(): void {
        this.cleanup(this.canvasEl ?? undefined);
    }
}

