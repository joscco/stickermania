import {Component, signal, ViewChild, ElementRef, OnInit} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import type {StickerPlacement, StickerDefinition} from "@birthday/shared";
import {StickerCanvasComponent} from '../../game/player/canvas/sticker-canvas.component';
import {StickerPaletteComponent} from '../../game/shared/sticker-palette/sticker-palette.component';
import type {StickerDroppedEvent} from '../../game/shared/sticker-palette/sticker-palette.component';
import {firstValueFrom} from "rxjs";

@Component({
    selector: "app-sticker-editor-test",
    standalone: true,
    imports: [CommonModule, RouterModule, StickerCanvasComponent, StickerPaletteComponent],
    templateUrl: "./sticker-editor-test.component.html",
})
export class StickerEditorTestComponent implements OnInit {
    @ViewChild("stickerCanvas")   stickerCanvas!: StickerCanvasComponent;
    @ViewChild("canvasWrapperEl") canvasWrapper!: ElementRef<HTMLDivElement>;
    @ViewChild("palette")         palette!: StickerPaletteComponent;

    public readonly placements  = signal<StickerPlacement[]>([]);
    public readonly maxStickers = 20;
    public readonly testCatalog = signal<StickerDefinition[]>([]);

    constructor(private readonly http: HttpClient) {}

    async ngOnInit(): Promise<void> {
        try {
            const catalog = await firstValueFrom(
                this.http.get<StickerDefinition[]>("/api/sticker-catalog")
            );
            if (catalog?.length) this.testCatalog.set(catalog);
        } catch {}
    }

    public onStickerDropped(event: StickerDroppedEvent): void {
        const current = this.placements();
        if (current.length >= this.maxStickers) return;

        const canvasEl = this.canvasWrapper?.nativeElement;
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();

        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;
        this.placements.set([...current, {
            instanceId: this.stickerCanvas?.generateInstanceId()
                ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId: event.stickerId,
            x: Math.max(0, x),
            y: Math.max(0, y),
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        }]);
    }

    public onPlacementsChanged(placements: StickerPlacement[]): void {
        this.placements.set(placements);
    }

    public onStickerRemoved(instanceId: string): void {
        this.placements.set(this.placements().filter(p => p.instanceId !== instanceId));
    }

    public clearCanvas(): void {
        this.placements.set([]);
    }
}
