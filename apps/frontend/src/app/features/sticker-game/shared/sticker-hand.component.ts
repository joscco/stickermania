import {Component, EventEmitter, Input, Output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerHand, StickerDefinition} from "@birthday/shared";

/**
 * Displays the player's sticker hand.
 * Tapping a sticker adds it to the canvas; long-press opens the swap modal.
 */
@Component({
    selector: "app-sticker-hand",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="px-3 py-2">
            <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-semibold text-stone-500">Deine Sticker</span>
                @if (hand.swapsRemaining > 0) {
                    <span class="text-xs text-amber-600 font-medium">{{ hand.swapsRemaining }} Tausch übrig</span>
                }
            </div>
            <div class="flex gap-2 overflow-x-auto pb-1">
                @for (stickerId of hand.stickerIds; track stickerId; let i = $index) {
                    <button
                        class="shrink-0 w-14 h-14 rounded-lg border-2 flex items-center justify-center bg-white transition-all active:scale-90"
                        [class.border-purple-300]="!usedStickerIds.has(stickerId)"
                        [class.border-stone-200]="usedStickerIds.has(stickerId)"
                        [class.opacity-40]="usedStickerIds.has(stickerId)"
                        [class.hover:border-purple-400]="!usedStickerIds.has(stickerId)"
                        [class.hover:shadow-md]="!usedStickerIds.has(stickerId)"
                        (click)="onStickerTap(stickerId)"
                        (contextmenu)="onStickerLongPress($event, i, stickerId)"
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
    @Input() usedStickerIds: Set<string> = new Set();
    @Output() stickerDragged = new EventEmitter<string>();
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
        if (this.usedStickerIds.has(stickerId)) return;
        this.stickerDragged.emit(stickerId);
    }

    public onStickerLongPress(event: Event, index: number, stickerId: string): void {
        event.preventDefault();
        if (this.hand.swapsRemaining > 0) {
            this.swapRequested.emit({index, stickerId});
        }
    }
}

