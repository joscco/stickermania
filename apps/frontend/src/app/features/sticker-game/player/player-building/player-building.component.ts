import {Component, AfterViewInit, ElementRef, inject, signal, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement} from "@birthday/shared";
import {StickerPlayerService} from "../../services/sticker-player.service";
import {GameSessionStore} from "../../../../core/challenge.store";
import {ApiService} from "../../../../core/api.service";
import {StickerCanvasComponent} from "../sticker-canvas/sticker-canvas.component";
import {StickerHandComponent} from "../sticker-hand/sticker-hand.component";
import {StickerSwapModalComponent} from "../sticker-swap-modal/sticker-swap-modal.component";
import gsap from "gsap";

@Component({
    selector: "app-player-building",
    standalone: true,
    imports: [CommonModule, StickerCanvasComponent, StickerHandComponent, StickerSwapModalComponent],
    templateUrl: "./player-building.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerBuildingComponent implements AfterViewInit {
    public readonly stickerService = inject(StickerPlayerService);
    private readonly sessionStore = inject(GameSessionStore);
    private readonly apiService = inject(ApiService);
    private readonly el = inject(ElementRef);

    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

    public readonly canvasPlacements = signal<StickerPlacement[]>([]);
    public readonly showSwapModal = signal(false);
    public readonly swapTargetStickerId = signal<string | null>(null);
    public readonly swapTargetIndex = signal<number | null>(null);

    public ngAfterViewInit(): void {
        const banner = this.el.nativeElement.querySelector(".p-anim-banner");
        const items = this.el.nativeElement.querySelectorAll(".p-anim");
        if (banner) gsap.fromTo(banner, {opacity: 0, y: -20}, {opacity: 1, y: 0, duration: 0.4, ease: "power2.out"});
        if (items.length) gsap.fromTo(items, {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: 0.35, stagger: 0.06, ease: "power2.out"});
    }

    public onStickerAddedFromHand(stickerId: string): void {
        const current = this.canvasPlacements();
        if (current.length >= this.stickerService.maxStickersOnCanvas()) return;

        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;
        const newPlacement: StickerPlacement = {
            instanceId: this.stickerCanvas?.generateInstanceId() ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId,
            x: 30 + Math.random() * 180,
            y: 30 + Math.random() * 180,
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        };
        this.canvasPlacements.set([...current, newPlacement]);
    }

    public onStickerDropped(event: { stickerId: string; x: number; y: number }): void {
        const current = this.canvasPlacements();
        if (current.length >= this.stickerService.maxStickersOnCanvas()) return;

        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;
        const newPlacement: StickerPlacement = {
            instanceId: this.stickerCanvas?.generateInstanceId() ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId: event.stickerId,
            x: event.x,
            y: event.y,
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        };
        this.canvasPlacements.set([...current, newPlacement]);
    }

    public onPlacementsChanged(placements: StickerPlacement[]): void {
        this.canvasPlacements.set(placements);
    }

    public onStickerRemoved(instanceId: string): void {
        this.canvasPlacements.set(this.canvasPlacements().filter(p => p.instanceId !== instanceId));
    }

    public async submitCollage(): Promise<void> {
        const placements = this.canvasPlacements();
        if (placements.length === 0) return;

        let imageDataUrl: string | null = null;
        try {
            imageDataUrl = await this.stickerCanvas.toDataUrl();
        } catch (err) {
            console.error("[collage] snapshot capture failed:", err);
        }

        this.stickerService.submitCollage(placements);

        if (imageDataUrl) {
            this.uploadSnapshot(imageDataUrl);
        }
    }

    private async uploadSnapshot(imageDataUrl: string): Promise<void> {
        const sessionId = this.sessionStore.sessionId();
        const playerId = this.sessionStore.playerId();
        if (!sessionId || !playerId) return;

        let collageId: string | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
            const ms = this.stickerService.modeState();
            if (ms) {
                const roundSubs = ms.submissions[ms.currentRoundIndex] ?? [];
                const mine = roundSubs.find(s => s.playerId === playerId);
                if (mine) {
                    collageId = mine.id;
                    break;
                }
            }
            await new Promise(r => setTimeout(r, 200));
        }

        if (!collageId) return;

        try {
            await this.apiService.uploadCollageImage(sessionId, playerId, collageId, imageDataUrl);
        } catch (err) {
            console.error("[collage] upload failed:", err);
        }
    }

    public openSwapModal(args: { index: number; stickerId: string }): void {
        this.swapTargetIndex.set(args.index);
        this.swapTargetStickerId.set(args.stickerId);
        this.showSwapModal.set(true);
    }

    public onSwapConfirmed(newStickerId: string): void {
        const idx = this.swapTargetIndex();
        if (idx !== null) {
            this.stickerService.swapSticker(idx, newStickerId);
        }
        this.closeSwapModal();
    }

    public closeSwapModal(): void {
        this.showSwapModal.set(false);
        this.swapTargetStickerId.set(null);
        this.swapTargetIndex.set(null);
    }
}

