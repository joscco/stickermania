import {Component, inject, signal, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement} from "@birthday/shared";
import {StickerPlayerService} from "../services/sticker-player.service";
import {WorldStore} from "../../../core/world.store";
import {GameSessionStore} from "../../../core/challenge.store";
import {ApiService} from "../../../core/api.service";
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
    public readonly sessionStore = inject(GameSessionStore);
    private readonly apiService = inject(ApiService);

    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

    public readonly canvasPlacements = signal<StickerPlacement[]>([]);
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

    public onStickerDropped(event: {stickerId: string; x: number; y: number}): void {
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

        // 1. Capture the canvas as PNG *before* submitting (UI will change after submit)
        let imageDataUrl: string | null = null;
        try {
            console.log("[collage] capturing canvas snapshot…");
            imageDataUrl = await this.stickerCanvas.toDataUrl();
            console.log("[collage] snapshot captured:", imageDataUrl?.length, "chars");
        } catch (err) {
            console.error("[collage] snapshot capture failed:", err);
        }

        // 2. Submit placements via WebSocket
        this.stickerService.submitCollage(placements);
        console.log("[collage] placements submitted via WS");

        // 3. Upload the PNG snapshot in the background (if captured)
        if (imageDataUrl) {
            this.uploadSnapshot(imageDataUrl);
        } else {
            console.warn("[collage] no imageDataUrl, skipping upload");
        }
    }

    /**
     * Wait for the collageId to appear in state, then upload the snapshot.
     */
    private async uploadSnapshot(imageDataUrl: string): Promise<void> {
        const sessionId = this.sessionStore.sessionId();
        const playerId = this.sessionStore.playerId();
        if (!sessionId || !playerId) {
            console.warn("[collage] missing sessionId or playerId, skipping upload");
            return;
        }

        // Wait for the submission to appear in state (poll briefly)
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

        if (!collageId) {
            console.warn("[collage] could not find collageId in state after 6s, skipping upload");
            return;
        }

        console.log("[collage] uploading snapshot for collageId:", collageId, "dataLen:", imageDataUrl.length);
        try {
            const result = await this.apiService.uploadCollageImage(sessionId, playerId, collageId, imageDataUrl);
            console.log("[collage] upload done:", result);
        } catch (err) {
            console.error("[collage] upload failed:", err);
        }
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

