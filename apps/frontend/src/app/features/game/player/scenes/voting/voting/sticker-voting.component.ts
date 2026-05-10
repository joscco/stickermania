import {Component, input, output} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {SessionPlayer, StickerCollage, StickerDefinition} from "@birthday/shared";

@Component({
  selector: "app-sticker-voting",
  standalone: true,
  imports: [CommonModule],
  templateUrl: 'sticker-voting.component.html',
})
export class StickerVotingComponent {
  submissions= input<StickerCollage[]>([]);
  stickerCatalog = input<StickerDefinition[]>([]);
  myVotes = input<string[]>([]);
  votesRemaining = input(0);
  players  = input<Record<string, SessionPlayer>>({});
  myPlayerId = input<string>("");
  voteClicked = output<string>();

  getMyVote(): string | null {
    return this.myVotes()[0] ?? null;
  }

  public isOwnSubmission(submission: StickerCollage): boolean {
    return !!this.myPlayerId() && submission.playerId === this.myPlayerId();
  }

  public onVote(collageId: string): void {
    const submission = this.submissions().find(s => s.id === collageId);
    if (!submission || this.isOwnSubmission(submission)) {
      return;
    }
    // Clicking the already-voted collage → unvote (server handles retract via same action)
    // Clicking another collage → move vote there
    // In both cases emit the collageId; backend toggles / moves the single vote.
    this.voteClicked.emit(collageId);
  }

  public ownSubmission(): StickerCollage | null {
    if (!this.myPlayerId()) {
      return null;
    }
    return this.submissions().find(submission => submission.playerId === this.myPlayerId()) ?? null;
  }

  public votableSubmissions(): StickerCollage[] {
    return this.submissions().filter(submission => !this.isOwnSubmission(submission));
  }
}
