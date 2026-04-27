import {Component, EventEmitter, Input, Output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerCollage, StickerDefinition, SessionPlayer} from "@birthday/shared";
import {StickerImgComponent} from "../../../../../shared/sticker-editor/sticker-img/sticker-img.component";

@Component({
    selector: "app-sticker-voting",
    standalone: true,
    imports: [CommonModule, StickerImgComponent],
    templateUrl: 'sticker-voting.component.html',
})
export class StickerVotingComponent {
    @Input() submissions: StickerCollage[] = [];
    @Input() stickerCatalog: StickerDefinition[] = [];
    /** The single collage ID the player has voted for, or empty string if none. */
    @Input() myVotes: string[] = [];
    @Input() votesRemaining: number = 0;
    @Input() players: Record<string, SessionPlayer> = {};
    @Input() myPlayerId: string = "";
    @Output() voteClicked = new EventEmitter<string>();

    private catalogMap = new Map<string, StickerDefinition>();

    /** The single vote this player has cast (first element of myVotes, or null). */
    getMyVote(): string | null {
        return this.myVotes[0] ?? null;
    }

    public getStickerUrl(stickerId: string): string {
        if (this.catalogMap.size !== this.stickerCatalog.length) {
            this.catalogMap.clear();
            for (const s of this.stickerCatalog) this.catalogMap.set(s.id, s);
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public getPlayerName(playerId: string): string {
        return this.players[playerId]?.name ?? "Anonym";
    }

    public isOwnSubmission(submission: StickerCollage): boolean {
        return !!this.myPlayerId && submission.playerId === this.myPlayerId;
    }

    public onVote(collageId: string): void {
        const submission = this.submissions.find(s => s.id === collageId);
        if (!submission || this.isOwnSubmission(submission)) return;
        // Clicking the already-voted collage → unvote (server handles retract via same action)
        // Clicking another collage → move vote there
        // In both cases emit the collageId; backend toggles / moves the single vote.
        this.voteClicked.emit(collageId);
    }

    public ownSubmission(): StickerCollage | null {
        if (!this.myPlayerId) return null;
        return this.submissions.find(s => s.playerId === this.myPlayerId) ?? null;
    }

    public votableSubmissions(): StickerCollage[] {
        return this.submissions.filter(s => !this.isOwnSubmission(s));
    }
}
