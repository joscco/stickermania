import {Component, EventEmitter, Input, Output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollage, StickerDefinition, SessionPlayer} from "@birthday/shared";

/**
 * Displays previous round's submissions for voting.
 */
@Component({
    selector: "app-sticker-voting",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="p-3">
            @if (votesRemaining > 0) {
                <p class="text-xs text-stone-500 mb-2">Tippe auf eine Collage zum Abstimmen ({{ votesRemaining }} Stimmen übrig)</p>
            } @else {
                <p class="text-xs text-emerald-600 mb-2 font-medium">✅ Alle Stimmen abgegeben!</p>
            }

            <div class="grid grid-cols-2 gap-3">
                @for (submission of submissions; track submission.id) {
                    <button
                        class="relative rounded-xl border-2 p-1 bg-white transition-all active:scale-95"
                        [class.border-amber-400]="myVotes.includes(submission.id)"
                        [class.shadow-amber-200]="myVotes.includes(submission.id)"
                        [class.shadow-md]="myVotes.includes(submission.id)"
                        [class.border-stone-200]="!myVotes.includes(submission.id)"
                        [disabled]="votesRemaining <= 0 && !myVotes.includes(submission.id)"
                        [class.opacity-50]="votesRemaining <= 0 && !myVotes.includes(submission.id)"
                        (click)="onVote(submission.id)"
                    >
                        <!-- Mini canvas preview -->
                        <div class="relative w-full aspect-square bg-stone-50 rounded-lg overflow-hidden">
                            @for (placement of submission.placements; track placement.instanceId) {
                                <img
                                    [src]="getStickerUrl(placement.stickerId)"
                                    [alt]="placement.stickerId"
                                    class="absolute w-8 h-8 object-contain"
                                    [style.left.px]="placement.x * 0.4"
                                    [style.top.px]="placement.y * 0.4"
                                    [style.transform]="'rotate(' + placement.rotation + 'deg) scale(' + (placement.scale * 0.4) + ')'"
                                    draggable="false"
                                />
                            }
                        </div>
                        <div class="mt-1 text-xs text-stone-600 font-medium truncate px-1">
                            {{ getPlayerName(submission.playerId) }}
                        </div>
                        @if (myVotes.includes(submission.id)) {
                            <div class="absolute top-1 right-1 bg-amber-400 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold">
                                ⭐
                            </div>
                        }
                    </button>
                }
            </div>
        </div>
    `,
})
export class StickerVotingComponent {
    @Input() submissions: StickerCollage[] = [];
    @Input() stickerCatalog: StickerDefinition[] = [];
    @Input() myVotes: string[] = [];
    @Input() votesRemaining: number = 0;
    @Input() players: Record<string, SessionPlayer> = {};
    @Output() voteClicked = new EventEmitter<string>();

    private catalogMap = new Map<string, StickerDefinition>();

    public getStickerUrl(stickerId: string): string {
        if (this.catalogMap.size !== this.stickerCatalog.length) {
            this.catalogMap.clear();
            for (const s of this.stickerCatalog) {
                this.catalogMap.set(s.id, s);
            }
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public getPlayerName(playerId: string): string {
        return this.players[playerId]?.name ?? "Anonym";
    }

    public onVote(collageId: string): void {
        if (this.votesRemaining > 0 && !this.myVotes.includes(collageId)) {
            this.voteClicked.emit(collageId);
        }
    }
}

