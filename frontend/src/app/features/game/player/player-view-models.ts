import type {SessionPlayer, MinigameTask, RoundVoteResult, OpenMinigameSubmission, RoundSubmission, MinigameSubmission} from '@birthday/shared';

export type MinigameVotingVariant = 'active' | 'done' | 'all-done';

export interface MinigameVotingViewModel {
  variant: MinigameVotingVariant;
  prompt: string;
  submissions: RoundSubmission[];
  myVotes: string[];
  votesRemaining: number;
  players: Record<string, SessionPlayer>;
  myPlayerId: string;
  currentTask: MinigameTask | null;
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

export interface ResultsViewModel {
  myPlacement: number | null;
  myVoteCount: number;
  isWinner: boolean;
  isTiedWinner: boolean;
  winnerId: string | null;
  winnerName: string;
  lastResults: RoundVoteResult[];
  currentTask: MinigameTask | null;
  myPlayerId: string;
  myMinigameSubmission: OpenMinigameSubmission | null;
  myMinigameResult: RoundVoteResult | null;
  /** Human-readable summary of the player's performance for this task */
  resultSummary: string;
}

export interface PlayerHeaderViewModel {
  playerName: string;
  avatarUrl: string | null;
  timeLeft: string | null;
  showEditControls: boolean;
}
