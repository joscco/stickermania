import gsap from 'gsap';
import {CANVAS_STICKER_PX} from '../sticker-shared/sticker-types';
import type {StickerDroppedEvent} from './sticker-palette.component';

/**
 * Manages the drag-ghost lifecycle for the sticker palette.
 *
 * Responsibilities:
 *  - Creates and animates the floating ghost image on pointer-down
 *  - Tracks pointer movement and highlights the drop target
 *  - Emits the drop event and cleans up on pointer-up / cancel
 *
 * Usage: one instance per StickerPaletteComponent.
 */
export class PaletteDragController {
    private ghostEl:      HTMLElement | null = null;
    private stickerId:    string | null      = null;
    private pointerId:    number | null      = null;
    private renderedW     = CANVAS_STICKER_PX;
    private renderedH     = CANVAS_STICKER_PX;

    private readonly boundMove = this.onMove.bind(this);
    private readonly boundUp   = this.onUp.bind(this);

    constructor(
        private readonly getDropTarget: () => HTMLElement | null,
        private readonly onDropped:     (ev: StickerDroppedEvent) => void,
        private readonly onActiveId:    (id: string | null) => void,
    ) {}

    /** Call from the thumb's pointerdown handler. */
    start(event: PointerEvent, stickerId: string, imageUrl: string, thumbEl: HTMLElement): void {
        if (event.button !== 0 && event.button !== undefined) return;
        event.preventDefault();

        this.stickerId = stickerId;
        this.pointerId = event.pointerId;
        this.onActiveId(stickerId);

        // Calculate rendered size from the thumb image's natural aspect ratio
        const thumbImg = thumbEl.querySelector('img') as HTMLImageElement | null;
        if (thumbImg && thumbImg.naturalWidth > 0 && thumbImg.naturalHeight > 0) {
            this.renderedH = CANVAS_STICKER_PX;
            this.renderedW = Math.round(CANVAS_STICKER_PX * thumbImg.naturalWidth / thumbImg.naturalHeight);
        } else {
            this.renderedW = CANVAS_STICKER_PX;
            this.renderedH = CANVAS_STICKER_PX;
        }

        this.ghostEl = this.createGhost(imageUrl, event.clientX, event.clientY);

        try { thumbEl.setPointerCapture(event.pointerId); } catch {}
        window.addEventListener('pointermove',   this.boundMove, {passive: false});
        window.addEventListener('pointerup',     this.boundUp);
        window.addEventListener('pointercancel', this.boundUp);
    }

    destroy(): void {
        this.cleanup();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private onMove(event: PointerEvent): void {
        if (event.pointerId !== this.pointerId) return;
        event.preventDefault();
        if (!this.ghostEl) return;

        this.ghostEl.style.left = `${event.clientX}px`;
        this.ghostEl.style.top  = `${event.clientY}px`;

        const target = this.getDropTarget();
        if (target) {
            const r    = target.getBoundingClientRect();
            const over = event.clientX >= r.left && event.clientX <= r.right &&
                         event.clientY >= r.top  && event.clientY <= r.bottom;
            target.style.outline = over ? '3px solid #a855f7' : '';
        }
    }

    private onUp(event: PointerEvent): void {
        if (event.pointerId !== this.pointerId) return;
        const target = this.getDropTarget();
        let dropped  = false;

        if (target && this.stickerId) {
            const r = target.getBoundingClientRect();
            if (event.clientX >= r.left && event.clientX <= r.right &&
                event.clientY >= r.top  && event.clientY <= r.bottom) {
                this.onDropped({
                    stickerId:     this.stickerId,
                    clientX:       event.clientX,
                    clientY:       event.clientY,
                    renderedWidth:  this.renderedW,
                    renderedHeight: this.renderedH,
                });
                dropped = true;
            }
        }

        const ghost = this.ghostEl;
        this.ghostEl = null;

        if (ghost) {
            if (!dropped) {
                gsap.to(ghost, {scale: 0, opacity: 0, duration: 0.15, ease: 'power2.in', onComplete: () => ghost.remove()});
            } else {
                ghost.remove();
            }
        }

        this.cleanup(target ?? undefined);
    }

    private createGhost(imageUrl: string, x: number, y: number): HTMLElement {
        const ghost = document.createElement('div');
        ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.35));';
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.cssText = `height:${CANVAS_STICKER_PX}px;width:auto;display:block;pointer-events:none;`;
        img.draggable = false;
        ghost.appendChild(img);
        document.body.appendChild(ghost);
        ghost.style.left = `${x}px`;
        ghost.style.top  = `${y}px`;
        gsap.set(ghost, {xPercent: -50, yPercent: -50, scale: 0.3, transformOrigin: '50% 50%'});
        gsap.to(ghost, {scale: 1, duration: 0.18, ease: 'back.out(1.5)'});
        return ghost;
    }

    private cleanup(target?: HTMLElement): void {
        if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
        this.renderedW  = CANVAS_STICKER_PX;
        this.renderedH  = CANVAS_STICKER_PX;
        this.stickerId  = null;
        this.pointerId  = null;
        this.onActiveId(null);
        if (target) target.style.outline = '';
        window.removeEventListener('pointermove',   this.boundMove);
        window.removeEventListener('pointerup',     this.boundUp);
        window.removeEventListener('pointercancel', this.boundUp);
    }
}

