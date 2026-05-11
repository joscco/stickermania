import type {StickerCollage, StickerDefinition, StickerHand, StickerPack, SessionPlayer} from '@birthday/shared';

export type VotingVariant = 'active' | 'done' | 'all-done';

export type WinnerStep = 'prompt' | 'unlock' | 'guaranteed' | null;

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
  myHand: StickerHand | null;
  stickerCatalog: StickerDefinition[];
  stickerPacks: StickerPack[];
  maxStickersOnCanvas: number;
}

export interface BuildingSubmittedViewModel {
  allPlayersDone: boolean;
}

export interface BuildingSkippedViewModel {
  allPlayersDone: boolean;
}

export interface ResultsViewModel {
  myPlacement: number | null;
  myVoteCount: number;
  isWinner: boolean;
  winnerChoicesDone: boolean;
  currentWinnerStep: WinnerStep;
  hasChosenPrompt: boolean;
  hasLockedPacks: boolean;
  hasUnlockedPack: boolean;
  promptChoices: string[];
  packUnlockChoices: StickerPack[];
  guaranteedPackChoices: StickerPack[];
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