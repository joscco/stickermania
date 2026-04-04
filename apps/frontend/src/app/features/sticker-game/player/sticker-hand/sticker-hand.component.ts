import {Component, EventEmitter, Input, Output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerHand, StickerDefinition} from "@birthday/shared";

/**
 * Displays the player's sticker hand.
 * Tapping a sticker adds a new instance to the canvas (duplicates allowed).
 * Long-press (context menu) opens the swap modal when swaps are available.
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
    /** Whether the canvas can accept more stickers (total limit not reached). */
    @Input() canAddMore: boolean = true;
    @Output() stickerTapped = new EventEmitter<string>();
    @Output() swapRequested = new EventEmitter<{index: number; stickerId: string}>();

    private catalogMap = new Map<string, StickerDefinition>();

    public getStickerUrl(stickerId: string): string {
        if (this.catalogMap.size !== this.stickerCatalog.length) {
            this.catalogMap.clear();
            for (const s of this.stickerCatalog) {
                this.catalogMap.set(s.id, s);
            }
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public onStickerTap(stickerId: string): void {
        if (!this.canAddMore) return;
        this.stickerTapped.emit(stickerId);
    }

    public onStickerLongPress(event: Event, index: number, stickerId: string): void {
        event.preventDefault();
        if (this.hand.swapsRemaining > 0) {
            this.swapRequested.emit({index, stickerId});
        }
    }
}
