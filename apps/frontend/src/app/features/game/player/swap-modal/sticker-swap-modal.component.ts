import {Component, EventEmitter, Input, Output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerDefinition} from "@birthday/shared";

/**
 * Modal for swapping a sticker in the hand with one from the catalog.
 */
@Component({
    selector: "app-sticker-swap-modal",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-swap-modal.component.html",
    styles: [`
        @keyframes slide-up {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
        }
        .animate-slide-up {
            animation: slide-up 0.25s ease-out;
        }
    `],
})
export class StickerSwapModalComponent {
    @Input() currentStickerId!: string;
    @Input() handIndex!: number;
    @Input() stickerCatalog: StickerDefinition[] = [];
    @Input() currentHandIds: string[] = [];
    @Input() swapsRemaining: number = 0;
    @Output() swapConfirmed = new EventEmitter<string>();
    @Output() closed = new EventEmitter<void>();

    public selectedNewId: string | null = null;

    public get availableStickers(): StickerDefinition[] {
        const handSet = new Set(this.currentHandIds);
        return this.stickerCatalog.filter(s => !handSet.has(s.id));
    }

    public selectSticker(id: string): void {
        this.selectedNewId = id;
    }

    public confirmSwap(): void {
        if (this.selectedNewId) {
            this.swapConfirmed.emit(this.selectedNewId);
        }
    }
}

