import {Component, inject, signal, computed, ViewChild, ElementRef, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement} from "@birthday/shared";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import {StickerCanvasComponent} from '../../canvas/sticker-canvas.component';
import {StickerPaletteComponent} from '../../../shared/sticker-palette/sticker-palette.component';
import type {StickerDroppedEvent} from '../../../shared/sticker-palette/sticker-palette.component';
import {GameSessionStore} from '../../../../../core/challenge.store';
import {ApiService} from '../../../../../core/api.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-player-building",
    standalone: true,
    imports: [CommonModule, StickerCanvasComponent, StickerPaletteComponent, AnimOnInitDirective],
    templateUrl: "./player-building.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerBuildingComponent implements OnDestroy {
    public readonly stickerService = inject(StickerPlayerService);
    private readonly sessionStore = inject(GameSessionStore);
    private readonly apiService = inject(ApiService);

    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;
    @ViewChild("canvasWrapper") canvasWrapper!: ElementRef<HTMLDivElement>;

    public readonly canvasPlacements = signal<StickerPlacement[]>([]);

    /** Catalog entries filtered to only the sticker IDs in the player's hand. */
    public readonly handStickers = computed(() => {
        const hand = this.stickerService.myHand();
        if (!hand) return [];
        const ids = new Set(hand.stickerIds);
        return this.stickerService.stickerCatalog().filter(s => ids.has(s.id));
    });

    ngOnDestroy(): void {}

    // ── Drop from palette ────────────────────────────────────────

    public onStickerDropped(event: StickerDroppedEvent): void {
        const current = this.canvasPlacements();
        if (current.length >= this.stickerService.maxStickersOnCanvas()) return;

        const canvasEl = this.canvasWrapper?.nativeElement;
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();

        // Centre the sticker on the drop point
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;
        this.canvasPlacements.set([...current, {
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
        this.canvasPlacements.set(placements);
    }

    public onStickerRemoved(instanceId: string): void {
        this.canvasPlacements.set(this.canvasPlacements().filter(p => p.instanceId !== instanceId));
    }

    // ── Submit ───────────────────────────────────────────────────

    public async submitCollage(): Promise<void> {
        const placements = this.canvasPlacements();
        if (placements.length === 0) return;

        let imageDataUrl: string | null = null;
        try { imageDataUrl = await this.stickerCanvas.toDataUrl(); } catch {}

        this.stickerService.submitCollage(placements);

        if (imageDataUrl) this.uploadSnapshot(imageDataUrl);
    }

    private async uploadSnapshot(imageDataUrl: string): Promise<void> {
        const sessionId = this.sessionStore.sessionId();
        const playerId  = this.sessionStore.playerId();
        if (!sessionId || !playerId) return;

        let collageId: string | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
            const ms = this.stickerService.modeState();
            if (ms) {
                const mine = (ms.submissions[ms.currentRoundIndex] ?? []).find(s => s.playerId === playerId);
                if (mine) { collageId = mine.id; break; }
            }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!collageId) return;
        try { await this.apiService.uploadCollageImage(sessionId, playerId, collageId, imageDataUrl); } catch {}
    }
}
