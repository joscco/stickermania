import {Component, inject, signal, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlacement} from "@birthday/shared";
import {StickerPlayerService} from "../services/sticker-player.service";
import {StickerCanvasComponent} from "../shared/sticker-canvas.component";
import {StickerHandComponent} from "../shared/sticker-hand.component";
import {StickerVotingComponent} from "../shared/sticker-voting.component";
import {StickerSwapModalComponent} from "../shared/sticker-swap-modal.component";
import {WorldStore} from "../../../core/world.store";

@Component({
    selector: "app-sticker-player-view",
    standalone: true,
    imports: [CommonModule, StickerCanvasComponent, StickerHandComponent, StickerVotingComponent, StickerSwapModalComponent],
    template: `
        <div class="h-full flex flex-col overflow-hidden">
            <!-- Prompt banner -->
            <div class="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 text-center">
                <span class="text-xs font-medium opacity-80">Runde {{ stickerService.currentRoundIndex() }}</span>
                <h2 class="text-base font-bold">{{ stickerService.currentPrompt() }}</h2>
            </div>

            @if (!stickerService.myHand()) {
                <!-- No hand yet → request one -->
                <div class="flex-1 flex flex-col items-center justify-center gap-4 p-6">
                    <div class="text-6xl">🎨</div>
                    <p class="text-stone-600 text-center text-sm">Bereit mitzumachen?<br/>Hol dir deine Sticker-Hand!</p>
                    <button
                        class="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg active:scale-95 transition-transform"
                        (click)="stickerService.requestHand()"
                    >
                        Sticker austeilen 🃏
                    </button>

                    @if (stickerService.previousRoundSubmissions().length > 0) {
                        <div class="w-full mt-4">
                            <app-sticker-voting
                                [submissions]="stickerService.previousRoundSubmissions()"
                                [stickerCatalog]="stickerService.stickerCatalog()"
                                [myVotes]="stickerService.myVotes()"
                                [votesRemaining]="stickerService.votesPerPlayer() - stickerService.myVotes().length"
                                [players]="worldStore.players()"
                                (voteClicked)="stickerService.castVote($event)"
                            />
                        </div>
                    }
                </div>
            } @else if (stickerService.hasSubmittedThisRound()) {
                <!-- Already submitted -->
                <div class="flex-1 flex flex-col items-center justify-center gap-4 p-6 overflow-y-auto">
                    <div class="text-6xl">✅</div>
                    <p class="text-stone-600 text-center font-medium">Eingereicht! 🎉</p>
                    <p class="text-stone-400 text-center text-sm">Warte auf das Ende der Runde oder stimme ab.</p>

                    @if (stickerService.previousRoundSubmissions().length > 0) {
                        <div class="w-full mt-4">
                            <app-sticker-voting
                                [submissions]="stickerService.previousRoundSubmissions()"
                                [stickerCatalog]="stickerService.stickerCatalog()"
                                [myVotes]="stickerService.myVotes()"
                                [votesRemaining]="stickerService.votesPerPlayer() - stickerService.myVotes().length"
                                [players]="worldStore.players()"
                                (voteClicked)="stickerService.castVote($event)"
                            />
                        </div>
                    }
                </div>
            } @else {
                <!-- Building mode: canvas + hand -->
                <div class="flex-1 flex flex-col overflow-hidden relative">
                    <!-- Canvas area -->
                    <div class="flex-1 min-h-0 relative bg-stone-50">
                        <app-sticker-canvas
                            #stickerCanvas
                            [placements]="canvasPlacements()"
                            [stickerCatalog]="stickerService.stickerCatalog()"
                            [maxStickers]="stickerService.maxStickersOnCanvas()"
                            [interactive]="true"
                            (placementsChanged)="onPlacementsChanged($event)"
                            (stickerRemoved)="onStickerRemoved($event)"
                        />
                        <!-- Sticker count badge -->
                        <div class="absolute top-2 right-2 bg-white/80 backdrop-blur text-xs font-medium text-stone-600 px-2 py-0.5 rounded-full border border-black/6">
                            {{ canvasPlacements().length }}/{{ stickerService.maxStickersOnCanvas() }}
                        </div>
                    </div>

                    <!-- Sticker hand at bottom -->
                    <div class="shrink-0 border-t border-black/10 bg-white">
                        <app-sticker-hand
                            [hand]="stickerService.myHand()!"
                            [stickerCatalog]="stickerService.stickerCatalog()"
                            [canAddMore]="canvasPlacements().length < stickerService.maxStickersOnCanvas()"
                            (stickerTapped)="onStickerAddedFromHand($event)"
                            (swapRequested)="openSwapModal($event)"
                        />

                        <!-- Submit button -->
                        <div class="px-4 pb-3 flex gap-2">
                            <button
                                class="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-semibold shadow-lg active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
                                [disabled]="canvasPlacements().length === 0"
                                (click)="submitCollage()"
                            >
                                Einreichen 🚀
                            </button>
                        </div>
                    </div>

                    <!-- Voting panel toggle (if previous submissions exist) -->
                    @if (stickerService.previousRoundSubmissions().length > 0) {
                        @if (showVotingPanel()) {
                            <div class="absolute bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-black/10 max-h-[40%] overflow-y-auto">
                                <div class="sticky top-0 bg-white/95 backdrop-blur px-4 py-2 border-b border-black/6 flex items-center justify-between">
                                    <span class="text-xs font-semibold text-stone-600">Abstimmen (letzte Runde)</span>
                                    <button class="text-xs text-stone-400" (click)="showVotingPanel.set(false)">Schließen</button>
                                </div>
                                <app-sticker-voting
                                    [submissions]="stickerService.previousRoundSubmissions()"
                                    [stickerCatalog]="stickerService.stickerCatalog()"
                                    [myVotes]="stickerService.myVotes()"
                                    [votesRemaining]="stickerService.votesPerPlayer() - stickerService.myVotes().length"
                                    [players]="worldStore.players()"
                                    (voteClicked)="stickerService.castVote($event)"
                                />
                            </div>
                        } @else {
                            <button
                                class="absolute bottom-20 right-3 z-20 bg-amber-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg active:scale-95"
                                (click)="showVotingPanel.set(true)"
                            >
                                🗳️ Abstimmen ({{ stickerService.votesPerPlayer() - stickerService.myVotes().length }} übrig)
                            </button>
                        }
                    }
                </div>

                @if (showSwapModal()) {
                    <app-sticker-swap-modal
                        [currentStickerId]="swapTargetStickerId()!"
                        [handIndex]="swapTargetIndex()!"
                        [stickerCatalog]="stickerService.stickerCatalog()"
                        [currentHandIds]="stickerService.myHand()!.stickerIds"
                        [swapsRemaining]="stickerService.myHand()!.swapsRemaining"
                        (swapConfirmed)="onSwapConfirmed($event)"
                        (closed)="closeSwapModal()"
                    />
                }
            }
        </div>
    `,
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

