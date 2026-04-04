import {Component, inject, signal, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement} from "@birthday/shared";
import {StickerPlayerService} from "../services/sticker-player.service";
import {WorldStore} from "../../../core/world.store";
import {StickerHandComponent} from './sticker-hand/sticker-hand.component';
import {StickerCanvasComponent} from './sticker-canvas/sticker-canvas.component';
import {StickerVotingComponent} from './sticker-voting/sticker-voting.component';
import {StickerSwapModalComponent} from './sticker-swap-modal/sticker-swap-modal.component';

@Component({
    selector: "app-sticker-player-view",
    standalone: true,
    imports: [CommonModule, StickerCanvasComponent, StickerHandComponent, StickerVotingComponent, StickerSwapModalComponent],
    templateUrl: "./sticker-player-view.component.html",
})
export class StickerPlayerViewComponent {
    public readonly stickerService = inject(StickerPlayerService);
    public readonly worldStore = inject(WorldStore);

    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

    public readonly canvasPlacements = signal<StickerPlacement[]>([]);
    public readonly showVotingPanel = signal(false);
    public readonly showSwapModal = signal(false);
    public readonly swapTargetStickerId = signal<string | null>(null);
    public readonly swapTargetIndex = signal<number | null>(null);

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

    public onPlacementsChanged(placements: StickerPlacement[]): void {
        this.canvasPlacements.set(placements);
    }

    public onStickerRemoved(instanceId: string): void {
        this.canvasPlacements.set(this.canvasPlacements().filter(p => p.instanceId !== instanceId));
    }

    public submitCollage(): void {
        this.stickerService.submitCollage(this.canvasPlacements());
    }

    public openSwapModal(args: {index: number; stickerId: string}): void {
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

