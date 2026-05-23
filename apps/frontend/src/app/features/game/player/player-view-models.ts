import type {StickerCollage, StickerDefinition, StickerPack, SessionPlayer} from '@birthday/shared';

export type VotingVariant = 'active' | 'done' | 'all-done';

export type WinnerStep = 'prompt' | 'unlock' | null;

export interface VotingViewModel {
  variant: VotingVariant;
  prompt: string;
  submissions: StickerCollage[];
  stickerCatalog: StickerDefinition[];
  myVotes: string[];
  votesRemaining: number;
  players: Record<string, SessionPlayer>;
  myPlayerId: string;
}

export interface BuildingViewModel {
  roundIndex: number;
  prompt: string;
  unlockedStickers: StickerDefinition[];
  stickerCatalog: StickerDefinition[];
  stickerPacks: StickerPack[];
  unlockedPackIds: string[];
  recommendedPackIds: string[];
  maxStickersOnCanvas: number;
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
  winnerChoicesDone: boolean;
  currentWinnerStep: WinnerStep;
  hasChosenPrompt: boolean;
  hasLockedPacks: boolean;
  hasUnlockedPack: boolean;
  promptChoices: string[];
  packUnlockChoices: StickerPack[];
  winnerId: string | null;
  winnerName: string;
  canReadyToAdvance: boolean;
}

export interface NextRoundViewModel {
  hasNewPack: boolean;
}

export interface PlayerHeaderViewModel {
  playerName: string;
  avatarUrl: string | null;
  timeLeft: string | null;
  showEditControls: boolean;
}