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
    template: `
        <div class="px-3 py-2">
            <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-semibold text-stone-500">Deine Sticker</span>
                <div class="flex items-center gap-2">
                    @if (hand.swapsRemaining > 0) {
                        <span class="text-xs text-amber-600 font-medium">{{ hand.swapsRemaining }} Tausch übrig</span>
                    }
                    @if (!canAddMore) {
                        <span class="text-xs text-red-400 font-medium">Max erreicht</span>
                    }
                </div>
            </div>
            <div class="flex gap-2 overflow-x-auto pb-1">
                @for (stickerId of hand.stickerIds; track $index) {
                    <button
                        class="shrink-0 w-14 h-14 rounded-lg border-2 flex items-center justify-center bg-white transition-all active:scale-90"
                        [class.border-purple-300]="canAddMore"
                        [class.border-stone-200]="!canAddMore"
                        [class.opacity-50]="!canAddMore"
                        [class.hover:border-purple-400]="canAddMore"
                        [class.hover:shadow-md]="canAddMore"
                        (click)="onStickerTap(stickerId)"
                        (contextmenu)="onStickerLongPress($event, $index, stickerId)"
                    >
                        <img
                            [src]="getStickerUrl(stickerId)"
                            [alt]="stickerId"
                            class="w-10 h-10 object-contain pointer-events-none"
                            draggable="false"
                        />
                    </button>
                }
            </div>
        </div>
    `,
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
