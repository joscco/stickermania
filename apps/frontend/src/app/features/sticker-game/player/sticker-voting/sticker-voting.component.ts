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
    templateUrl: 'sticker-voting.component.html',
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

