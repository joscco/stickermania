import {Component, EventEmitter, Input, Output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerHand, StickerDefinition} from "@birthday/shared";

export interface DragStartEvent {
    stickerId: string;
    imageUrl: string;
    startClientX: number;
    startClientY: number;
    /** Pixel size of the sticker as rendered in the hand (for ghost sizing) */
    renderedSize: number;
}

/**
 * Displays the player's sticker hand.
 * - Tap: add sticker to canvas
 * - Pointer-drag (horizontal): start custom drag to canvas
 *   Horizontal movement → drag; vertical movement → allow native scroll
 */
@Component({
    selector: "app-sticker-hand",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-hand.component.html",
})
export class StickerHandComponent {
    @Input() hand!: StickerHand;
    @Input() stickerCatalog: StickerDefinition[] = [];
    @Input() canAddMore: boolean = true;
    @Output() stickerTapped = new EventEmitter<string>();
    @Output() dragStarted = new EventEmitter<DragStartEvent>();

    private catalogMap = new Map<string, StickerDefinition>();

    // Per-pointer state
    private pointerDownX = 0;
    private pointerDownY = 0;
    private pointerDownTime = 0;
    private dragFired = false;
    private activePointerId: number | null = null;
    private intentResolved: 'drag' | 'scroll' | null = null;

    public getStickerUrl(stickerId: string): string {
        if (this.catalogMap.size !== this.stickerCatalog.length) {
            this.catalogMap.clear();
            for (const s of this.stickerCatalog) this.catalogMap.set(s.id, s);
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public onPointerDown(event: PointerEvent): void {
        if (event.button !== undefined && event.button !== 0) return;
        this.pointerDownX = event.clientX;
        this.pointerDownY = event.clientY;
        this.pointerDownTime = performance.now();
        this.dragFired = false;
        this.intentResolved = null;
        this.activePointerId = event.pointerId;
    }

    public onPointerMove(event: PointerEvent, stickerId: string, targetEl: HTMLElement): void {
        if (event.pointerId !== this.activePointerId) return;
        if (this.dragFired || this.intentResolved === 'scroll') return;

        const dx = event.clientX - this.pointerDownX;
        const dy = event.clientY - this.pointerDownY;
        const dist = Math.hypot(dx, dy);

        if (dist < 6) return; // dead zone

        // Resolve intent by dominant axis
        if (this.intentResolved === null) {
            if (Math.abs(dy) > Math.abs(dx) * 1.5) {
                // Mostly vertical → scrolling
                this.intentResolved = 'scroll';
                return;
            } else if (Math.abs(dx) > 6) {
                this.intentResolved = 'drag';
            } else {
                return; // not enough horizontal yet
            }
        }

        if (!this.canAddMore) return;

        // Start drag
        this.dragFired = true;
        // Capture the pointer so we get moves outside the element
        try { targetEl.setPointerCapture(event.pointerId); } catch {}

        // Measure the rendered img size for the ghost
        const img = targetEl.querySelector("img") as HTMLImageElement | null;
        const renderedSize = img ? Math.max(img.offsetWidth, img.offsetHeight) : 40;

        this.dragStarted.emit({
            stickerId,
            imageUrl: this.getStickerUrl(stickerId),
            startClientX: event.clientX,
            startClientY: event.clientY,
            renderedSize,
        });
    }

    public onPointerUp(event: PointerEvent, stickerId: string): void {
        if (event.pointerId !== this.activePointerId) return;
        const wasDrag = this.dragFired;
        const wasScroll = this.intentResolved === 'scroll';
        const elapsed = performance.now() - this.pointerDownTime;
        this.dragFired = false;
        this.intentResolved = null;
        this.activePointerId = null;

        if (!wasDrag && !wasScroll && elapsed < 350 && this.canAddMore) {
            this.stickerTapped.emit(stickerId);
        }
    }
}
