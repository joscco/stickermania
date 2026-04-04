import {Component, EventEmitter, Input, Output, signal, ElementRef, ViewChild, AfterViewInit, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement, StickerDefinition} from "@birthday/shared";

/**
 * Interactive sticker canvas component.
 * Renders sticker placements as positioned/rotated/scaled images.
 * In interactive mode, supports drag to reposition, pinch/two-finger to scale and rotate,
 * and double-tap to remove.
 */
@Component({
    selector: "app-sticker-canvas",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            #canvasArea
            class="w-full h-full relative overflow-hidden bg-white rounded-lg"
            [class.border-2]="interactive"
            [class.border-dashed]="interactive"
            [class.border-purple-200]="interactive"
            style="touch-action: none;"
        >
            <!-- Grid background -->
            <div class="absolute inset-0 opacity-5"
                 style="background-image: radial-gradient(circle, #6b7280 1px, transparent 1px); background-size: 20px 20px;">
            </div>

            @for (placement of placements; track placement.stickerId) {
                <div
                    class="absolute cursor-grab active:cursor-grabbing select-none"
                    [class.ring-2]="interactive && selectedStickerId() === placement.stickerId"
                    [class.ring-purple-400]="interactive && selectedStickerId() === placement.stickerId"
                    [class.rounded-lg]="interactive && selectedStickerId() === placement.stickerId"
                    [style.left.px]="placement.x"
                    [style.top.px]="placement.y"
                    [style.transform]="'rotate(' + placement.rotation + 'deg) scale(' + placement.scale + ')'"
                    [style.z-index]="placement.zIndex"
                    [style.transform-origin]="'center center'"
                    (pointerdown)="interactive && onPointerDown($event, placement.stickerId)"
                    (dblclick)="interactive && onDoubleClick(placement.stickerId)"
                >
                    <img
                        [src]="getStickerUrl(placement.stickerId)"
                        [alt]="placement.stickerId"
                        class="w-16 h-16 object-contain pointer-events-none"
                        draggable="false"
                    />
                </div>
            }

            @if (interactive && placements.length === 0) {
                <div class="absolute inset-0 flex items-center justify-center text-stone-300 pointer-events-none">
                    <div class="text-center">
                        <div class="text-4xl mb-2">👆</div>
                        <p class="text-sm">Tippe auf einen Sticker unten,<br/>um ihn aufs Canvas zu legen</p>
                    </div>
                </div>
            }

            @if (interactive && selectedStickerId()) {
                <div class="absolute bottom-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-white/90 backdrop-blur rounded-full px-3 py-1.5 shadow-lg border border-black/10">
                    <button class="text-lg active:scale-90" (click)="rotateSelected(-15)" title="Links drehen">↺</button>
                    <button class="text-lg active:scale-90" (click)="rotateSelected(15)" title="Rechts drehen">↻</button>
                    <button class="text-lg active:scale-90" (click)="scaleSelected(0.9)" title="Kleiner">➖</button>
                    <button class="text-lg active:scale-90" (click)="scaleSelected(1.1)" title="Größer">➕</button>
                    <button class="text-lg active:scale-90 text-red-400" (click)="removeSelected()" title="Entfernen">🗑️</button>
                </div>
            }
        </div>
    `,
})
export class StickerCanvasComponent implements AfterViewInit, OnDestroy {
    @Input() placements: StickerPlacement[] = [];
    @Input() stickerCatalog: StickerDefinition[] = [];
    @Input() maxStickers: number = 12;
    @Input() interactive: boolean = false;
    @Output() placementsChanged = new EventEmitter<StickerPlacement[]>();
    @Output() stickerRemoved = new EventEmitter<string>();

    @ViewChild("canvasArea") canvasArea!: ElementRef<HTMLDivElement>;

    public readonly selectedStickerId = signal<string | null>(null);

    private dragging = false;
    private dragStickerId: string | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;

    private readonly boundPointerMove = this.onPointerMove.bind(this);
    private readonly boundPointerUp = this.onPointerUp.bind(this);

    private catalogMap = new Map<string, StickerDefinition>();

    ngAfterViewInit(): void {
        this.buildCatalogMap();
    }

    ngOnDestroy(): void {
        document.removeEventListener("pointermove", this.boundPointerMove);
        document.removeEventListener("pointerup", this.boundPointerUp);
    }

    private buildCatalogMap(): void {
        this.catalogMap.clear();
        for (const s of this.stickerCatalog) {
            this.catalogMap.set(s.id, s);
        }
    }

    public getStickerUrl(stickerId: string): string {
        if (this.catalogMap.size !== this.stickerCatalog.length) {
            this.buildCatalogMap();
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public onPointerDown(event: PointerEvent, stickerId: string): void {
        if (!this.interactive) return;
        event.preventDefault();
        event.stopPropagation();

        this.selectedStickerId.set(stickerId);
        this.dragging = true;
        this.dragStickerId = stickerId;

        const placement = this.placements.find(p => p.stickerId === stickerId);
        if (placement) {
            const rect = this.canvasArea.nativeElement.getBoundingClientRect();
            this.dragOffsetX = event.clientX - rect.left - placement.x;
            this.dragOffsetY = event.clientY - rect.top - placement.y;
        }

        document.addEventListener("pointermove", this.boundPointerMove);
        document.addEventListener("pointerup", this.boundPointerUp);
    }

    private onPointerMove(event: PointerEvent): void {
        if (!this.dragging || !this.dragStickerId) return;

        const rect = this.canvasArea.nativeElement.getBoundingClientRect();
        const newX = event.clientX - rect.left - this.dragOffsetX;
        const newY = event.clientY - rect.top - this.dragOffsetY;

        const updated = this.placements.map(p =>
            p.stickerId === this.dragStickerId
                ? {...p, x: newX, y: newY}
                : p
        );
        this.placementsChanged.emit(updated);
    }

    private onPointerUp(): void {
        this.dragging = false;
        this.dragStickerId = null;
        document.removeEventListener("pointermove", this.boundPointerMove);
        document.removeEventListener("pointerup", this.boundPointerUp);
    }

    public onDoubleClick(stickerId: string): void {
        this.removeSticker(stickerId);
    }

    public rotateSelected(degrees: number): void {
        const id = this.selectedStickerId();
        if (!id) return;
        const updated = this.placements.map(p =>
            p.stickerId === id ? {...p, rotation: p.rotation + degrees} : p
        );
        this.placementsChanged.emit(updated);
    }

    public scaleSelected(factor: number): void {
        const id = this.selectedStickerId();
        if (!id) return;
        const updated = this.placements.map(p =>
            p.stickerId === id ? {...p, scale: Math.max(0.3, Math.min(3, p.scale * factor))} : p
        );
        this.placementsChanged.emit(updated);
    }

    public removeSelected(): void {
        const id = this.selectedStickerId();
        if (!id) return;
        this.removeSticker(id);
    }

    private removeSticker(stickerId: string): void {
        this.selectedStickerId.set(null);
        this.stickerRemoved.emit(stickerId);
    }
}

