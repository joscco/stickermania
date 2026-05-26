import type {StickerCollage, SessionPlayer, MinigameTask, MinigameSubmission, StickerCollageVoteResult} from '@birthday/shared';

export type VotingVariant = 'active' | 'done' | 'all-done';

export interface VotingViewModel {
  variant: VotingVariant;
  prompt: string;
  submissions: StickerCollage[];
  myVotes: string[];
  votesRemaining: number;
  players: Record<string, SessionPlayer>;
  myPlayerId: string;
  /** The current minigame task, for minigame-specific voting UI */
  currentTask: MinigameTask | null;
  /** Minigame submissions for the current round */
  minigameSubmissions: MinigameSubmission[];
}

export interface BuildingViewModel {
  roundIndex: number;
  prompt: string;
  task: MinigameTask | null;
}

export interface BuildingSubmittedViewModel {
  allPlayersDone: boolean;
  players: Record<string, SessionPlayer>;
  roundParticipantIds: string[];
  submittedPlayerIds: Set<string>;
}

export interface BuildingSkippedViewModel {
  allPlayersDone: boolean;
  players: Record<string, SessionPlayer>;
  roundParticipantIds: string[];
  submittedPlayerIds: Set<string>;
}

export interface VotingDoneViewModel {
  allVotingDone: boolean;
  players: Record<string, SessionPlayer>;
  roundParticipantIds: string[];
  doneVotingIds: string[];
}

export interface ResultsViewModel {
  myPlacement: number | null;
  myVoteCount: number;
  isWinner: boolean;
  isTiedWinner: boolean;
  winnerId: string | null;
  winnerName: string;
  lastVoteResults: StickerCollageVoteResult[];
  currentTask: MinigameTask | null;
  /** Human-readable summary of the player's performance for this task */
  resultSummary: string;
}

export interface PlayerHeaderViewModel {
  playerName: string;
  avatarUrl: string | null;
  timeLeft: string | null;
  showEditControls: boolean;
}
