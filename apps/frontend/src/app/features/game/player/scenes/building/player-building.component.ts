import {Component, inject, signal, ViewChild, ElementRef, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement} from "@birthday/shared";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import {StickerCanvasComponent} from '../../canvas/sticker-canvas.component';
import {StickerHandComponent} from '../../hand/sticker-hand.component';
import type {DragStartEvent} from '../../hand/sticker-hand.component';
import {StickerSwapModalComponent} from '../../swap-modal/sticker-swap-modal.component';
import {GameSessionStore} from '../../../../../core/challenge.store';
import {ApiService} from '../../../../../core/api.service';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-player-building",
    standalone: true,
    imports: [CommonModule, StickerCanvasComponent, StickerHandComponent, StickerSwapModalComponent, AnimOnInitDirective, AnimGroupDirective],
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
    public readonly showSwapModal = signal(false);
    public readonly swapTargetStickerId = signal<string | null>(null);
    public readonly swapTargetIndex = signal<number | null>(null);

    // ── Pointer-drag state ───────────────────────────────────────
    private ghostEl: HTMLElement | null = null;
    private dragStickerId: string | null = null;
    private boundPointerMove = this.onGlobalPointerMove.bind(this);
    private boundPointerUp = this.onGlobalPointerUp.bind(this);

    ngOnDestroy(): void {
        this.cleanupDrag();
    }

    // ── Sticker placement ────────────────────────────────────────

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

    // ── Pointer-based drag from hand ─────────────────────────────

    public onDragStarted(evt: DragStartEvent): void {
        if (this.canvasPlacements().length >= this.stickerService.maxStickersOnCanvas()) return;

        this.dragStickerId = evt.stickerId;

        // Ghost size matches actual rendered sticker size in the hand
        const ghostSize = evt.renderedSize;

        const ghost = document.createElement("div");
        ghost.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 9999;
            opacity: 0.88;
            transform: translate(-50%, -50%) scale(1.1);
            transition: transform 0.08s;
            filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25));
        `;
        const img = document.createElement("img");
        img.src = evt.imageUrl;
        img.style.cssText = `width: ${ghostSize}px; height: ${ghostSize}px; object-fit: contain; display: block; pointer-events: none;`;
        img.draggable = false;
        ghost.appendChild(img);
        document.body.appendChild(ghost);

        this.ghostEl = ghost;

        ghost.style.left = `${evt.startClientX}px`;
        ghost.style.top = `${evt.startClientY}px`;

        window.addEventListener("pointermove", this.boundPointerMove, {passive: false});
        window.addEventListener("pointerup", this.boundPointerUp);
        window.addEventListener("pointercancel", this.boundPointerUp);
    }

    private onGlobalPointerMove(ev: PointerEvent): void {
        ev.preventDefault();
        if (!this.ghostEl) return;
        this.ghostEl.style.left = `${ev.clientX}px`;
        this.ghostEl.style.top = `${ev.clientY}px`;

        // Highlight canvas if dragging over it
        const canvasEl = this.canvasWrapper?.nativeElement;
        if (canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            const over = ev.clientX >= rect.left && ev.clientX <= rect.right &&
                         ev.clientY >= rect.top && ev.clientY <= rect.bottom;
            canvasEl.style.outline = over ? "3px solid #a855f7" : "";
        }
    }

    private onGlobalPointerUp(ev: PointerEvent): void {
        if (!this.dragStickerId) {
            this.cleanupDrag();
            return;
        }

        // Check if dropped over canvas
        const canvasEl = this.canvasWrapper?.nativeElement;
        if (canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            if (ev.clientX >= rect.left && ev.clientX <= rect.right &&
                ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
                // Use half the ghost image size as the centering offset
                const ghostImg = this.ghostEl?.querySelector("img") as HTMLImageElement | null;
                const halfSize = ghostImg ? ghostImg.offsetWidth / 2 : 32;
                const x = ev.clientX - rect.left - halfSize;
                const y = ev.clientY - rect.top - halfSize;
                this.onStickerDropped({
                    stickerId: this.dragStickerId,
                    x: Math.max(0, x),
                    y: Math.max(0, y),
                });
            }
        }

        this.cleanupDrag();
    }

    private cleanupDrag(): void {
        if (this.ghostEl) {
            this.ghostEl.remove();
            this.ghostEl = null;
        }
        this.dragStickerId = null;
        // Remove canvas highlight
        const canvasEl = this.canvasWrapper?.nativeElement;
        if (canvasEl) canvasEl.style.outline = "";

        window.removeEventListener("pointermove", this.boundPointerMove);
        window.removeEventListener("pointerup", this.boundPointerUp);
        window.removeEventListener("pointercancel", this.boundPointerUp);
    }

    // ── Submit ───────────────────────────────────────────────────

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

    // ── Swap modal ───────────────────────────────────────────────

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

