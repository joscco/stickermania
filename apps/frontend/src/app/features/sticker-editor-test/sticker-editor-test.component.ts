import {Component, signal, ViewChild, OnInit} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import type {StickerPlacement, StickerDefinition} from "@birthday/shared";
import {StickerCanvasComponent} from "../sticker-game/player/sticker-canvas/sticker-canvas.component";
import {firstValueFrom} from "rxjs";

/**
 * Standalone test editor for the sticker canvas.
 * Loads the full sticker catalog (with hitbox data) from the backend.
 * Navigate to /editor to use.
 */
@Component({
    selector: "app-sticker-editor-test",
    standalone: true,
    imports: [CommonModule, RouterModule, StickerCanvasComponent],
    templateUrl: "./sticker-editor-test.component.html",
})
export class StickerEditorTestComponent implements OnInit {
    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

    public readonly placements = signal<StickerPlacement[]>([]);
    public readonly maxStickers = 20;

    /** Full catalog — loaded from backend dynamically */
    public readonly testCatalog = signal<StickerDefinition[]>([]);

    constructor(private readonly http: HttpClient) {}

    async ngOnInit(): Promise<void> {
        try {
            const catalog = await firstValueFrom(
                this.http.get<StickerDefinition[]>("/api/sticker-catalog")
            );
            if (catalog && catalog.length > 0) {
                this.testCatalog.set(catalog);
            }
        } catch {
            // Backend not available — catalog stays empty
        }
    }

    public addStickerToCanvas(stickerId: string): void {
        const current = this.placements();
        if (current.length >= this.maxStickers) return;

        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;
        const newPlacement: StickerPlacement = {
            instanceId: this.stickerCanvas?.generateInstanceId()
                ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId,
            x: 40 + Math.random() * 200,
            y: 40 + Math.random() * 200,
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        };
        this.placements.set([...current, newPlacement]);
    }

    public onStickerDropped(event: {stickerId: string; x: number; y: number}): void {
        const current = this.placements();
        if (current.length >= this.maxStickers) return;

        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;
        const newPlacement: StickerPlacement = {
            instanceId: this.stickerCanvas?.generateInstanceId()
                ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId: event.stickerId,
            x: event.x,
            y: event.y,
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        };
        this.placements.set([...current, newPlacement]);
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

    public getStickerUrl(stickerId: string): string {
        return this.testCatalog().find(s => s.id === stickerId)?.imageUrl ?? "";
    }
}
