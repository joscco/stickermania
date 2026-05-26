import type {MinigameTask, MinigameSubmission, MinigameClientAction, StickerCollage, StickerCollageVoteResult} from '../index.js';

export interface MinigameHandler<
  TTask extends MinigameTask = MinigameTask,
  TSubmission extends MinigameSubmission = MinigameSubmission,
> {
  readonly type: string;

  parseTask(raw: Record<string, unknown>, id: string, title: string, durationSec: number): TTask;

  createSubmission(
    playerId: string,
    roundIndex: number,
    action: MinigameClientAction,
    now: number,
  ): TSubmission | null;

  getSnapshotSvg(submission: TSubmission): string | null;

  requiresVoting(): boolean;

  evaluateSubmissions(
    submissions: TSubmission[],
    collages: StickerCollage[],
    task: TTask,
  ): { results: StickerCollageVoteResult[]; winnerId: string | null; tiedWinnerIds: string[] };

  getResultSummary(
    mySubmission: TSubmission | undefined,
    allSubmissions: TSubmission[],
    task: TTask,
  ): string;

  getDescription(task: TTask): string;
}
