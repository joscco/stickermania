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
    template: `
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm" (click)="closed.emit()">
            <div
                class="w-full max-w-lg bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col animate-slide-up"
                (click)="$event.stopPropagation()"
            >
                <div class="px-4 py-3 border-b border-black/6 flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-semibold text-stone-800">Sticker tauschen</h3>
                        <p class="text-xs text-stone-400">{{ swapsRemaining }} Tausch(e) übrig</p>
                    </div>
                    <button class="text-stone-400 hover:text-stone-600 text-lg" (click)="closed.emit()">✕</button>
                </div>

                <div class="flex-1 overflow-y-auto p-4">
                    <p class="text-xs text-stone-500 mb-3">Wähle einen neuen Sticker als Ersatz:</p>
                    <div class="grid grid-cols-5 gap-2">
                        @for (sticker of availableStickers; track sticker.id) {
                            <button
                                class="w-14 h-14 rounded-lg border-2 border-stone-200 flex items-center justify-center bg-white hover:border-purple-400 hover:shadow-md active:scale-90 transition-all"
                                [class.border-purple-400]="sticker.id === selectedNewId"
                                [class.shadow-md]="sticker.id === selectedNewId"
                                (click)="selectSticker(sticker.id)"
                            >
                                <img [src]="sticker.imageUrl" [alt]="sticker.id" class="w-10 h-10 object-contain" draggable="false"/>
                            </button>
                        }
                    </div>
                </div>

                @if (selectedNewId) {
                    <div class="px-4 py-3 border-t border-black/6">
                        <button
                            class="w-full bg-purple-600 text-white py-2.5 rounded-xl font-semibold active:scale-95 transition-transform"
                            (click)="confirmSwap()"
                        >
                            Tauschen ♻️
                        </button>
                    </div>
                }
            </div>
        </div>
    `,
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

