import {Component, input, output, computed, signal} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {RoundSubmission, SessionPlayer, MinigameTask, MinigameSubmission, DrawingSubmission, TextAnswerSubmission} from '@birthday/shared';

interface VotingEntry {
  submissionId: string;
  playerId: string;
  playerName: string;
  snapshotUrl?: string;
  answer?: string;
  extraTasks?: string[];
}

@Component({
  selector: "app-minigame-voting",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./minigame-voting.component.html",
  host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class MinigameVotingComponent {
  readonly submissions = input.required<RoundSubmission[]>();
  readonly minigameSubmissions = input<MinigameSubmission[]>([]);
  readonly currentTask = input<MinigameTask | null>(null);
  readonly players = input<Record<string, SessionPlayer>>({});
  readonly myPlayerId = input<string>("");
  readonly myVotes = input<string[]>([]);
  readonly votesRemaining = input<number>(0);

  readonly voteClicked = output<string>();

  readonly taskType = computed(() => this.currentTask()?.type ?? null);

  /** For text-answer: vote question from task */
  readonly voteQuestion = computed(() => {
    const t = this.currentTask();
    if (t?.type === "text-answer") return (t as any).voteQuestion ?? "";
    return "";
  });

  /** Show only other players' submissions */
  readonly entries = computed<VotingEntry[]>(() => {
    const subs = this.submissions();
    const minigames = this.minigameSubmissions();
    const players = this.players();

    return subs
      .filter(s => s.playerId !== this.myPlayerId())
      .map(s => {
        const player = players[s.playerId];
        const mg = minigames.find(m => m.playerId === s.playerId);
        const entry: VotingEntry = {
          submissionId: s.id,
          playerId: s.playerId,
          playerName: player?.name ?? s.playerId,
          snapshotUrl: s.snapshotUrl,
        };
        if (mg?.type === "text-answer") {
          entry.answer = (mg as TextAnswerSubmission).answer;
        }
        if (this.taskType() === "drawing") {
          const drawTask = this.currentTask() as any;
          if (drawTask?.extraTasks?.length > 0) {
            entry.extraTasks = drawTask.extraTasks;
          }
        }
        return entry;
      });
  });

  /** Guesses for drawing: per submissionId → guessed extra task */
  readonly selectedGuesses = new Map<string, string>();

  vote(submissionId: string): void {
    this.voteClicked.emit(submissionId);
  }

  guessExtraTask(submissionId: string, task: string): void {
    this.selectedGuesses.set(submissionId, task);
    this.vote(submissionId);
  }

  getGuess(submissionId: string): string | undefined {
    return this.selectedGuesses.get(submissionId);
  }
}
