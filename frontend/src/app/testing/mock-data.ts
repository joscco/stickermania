import type {SessionPlayer, SessionState, RoundSubmission, PartyBuildingState, PartyGameState, PartyLobbyState, PartyResultsState, RoundVoteResult, PartyVotingState,} from '@birthday/shared';

export const MOCK_PLAYERS: Record<string, SessionPlayer> = {
  'player-1': { id: 'player-1', name: 'Anna', avatarUrl: 'assets/png/example_avatar_player_1.png', avatarAssetPath: null, score: 120, joinedAt: 0, connected: true, isHost: true, teamId: null },
  'player-2': { id: 'player-2', name: 'Bruno', avatarUrl: 'assets/png/example_avatar_player_2.png', avatarAssetPath: null, score: 80, joinedAt: 0, connected: true, isHost: false, teamId: null },
  'player-3': { id: 'player-3', name: 'Carl', avatarUrl: 'assets/png/example_avatar_player_3.png', avatarAssetPath: null, score: 60, joinedAt: 0, connected: true, isHost: false, teamId: null },
};

const MOCK_VOTE_RESULTS: RoundVoteResult[] = [
  { submissionId: 'col-1', playerId: 'player-1', voteCount: 2, placement: 1 },
  { submissionId: 'col-2', playerId: 'player-2', voteCount: 1, placement: 2 },
  { submissionId: 'col-3', playerId: 'player-3', voteCount: 0, placement: 3 },
];

export const MOCK_SUBMISSIONS: RoundSubmission[] = [
  {id: 'col-1', playerId: 'player-1', roundIndex: 0, placements: [], submittedAt: Date.now()},
  {id: 'col-2', playerId: 'player-2', roundIndex: 0, placements: [], submittedAt: Date.now()},
  {id: 'col-3', playerId: 'player-3', roundIndex: 0, placements: [], submittedAt: Date.now()},
];

// ── Phase state builders ────────────────────────────────────────────────────

export function lobbyPhase(): PartyLobbyState {
  return { phase: 'LOBBY' };
}

export function buildingPhase(opts?: {
  skippedPlayerIds?: string[];
}): PartyBuildingState {
  return {
    phase: 'BUILDING',
    roundEndsAt: Date.now() + 20_000,
    skippedPlayerIds: opts?.skippedPlayerIds ?? [],
  };
}

export function votingPhase(opts?: {
  currentVotes?: Record<string, string[]>;
  doneVotingIds?: string[];
}): PartyVotingState {
  return {
    phase: 'VOTING',
    votingEndsAt: Date.now() + 120_000,
    currentVotes: opts?.currentVotes ?? {},
    doneVotingIds: opts?.doneVotingIds ?? [],
  };
}

export function resultsPhase(): PartyResultsState {
  return {
    phase: 'RESULTS',
    resultsEndsAt: Date.now() + 60_000,
    lastVoteResults: MOCK_VOTE_RESULTS,
    winnerId: 'player-1',
    tiedWinnerIds: [],
    readyToAdvanceIds: [],
  };
}

// ── Game state builder ───────────────────────────────────────────────────────

export function makeGameState(
  phaseState: PartyBuildingState | PartyVotingState | PartyResultsState | PartyLobbyState,
  overrides?: Partial<PartyGameState>,
): PartyGameState {
  const base: PartyGameState = {
    currentRoundIndex: 0,
    currentPrompt: 'Das schönste Geburtstagsmonster',
    currentTask: null,
    roundStartedAt: Date.now() - 60_000,
    submissions: {},
    minigameSubmissions: {},
    promptHistory: { 0: 'Das schönste Geburtstagsmonster' },
    roundParticipantIds: ['player-1', 'player-2', 'player-3'],
    phaseState,
    roundDurationSec: 20,
    votingDurationSec: 120,
    resultsDurationSec: 60,
  };
  return overrides ? { ...base, ...overrides } : base;
}

// ── Session state builder ────────────────────────────────────────────────────

export function makeSessionState(
  phaseState: PartyBuildingState | PartyVotingState | PartyResultsState | PartyLobbyState,
  players?: Record<string, SessionPlayer>,
  gameStateOverrides?: Partial<PartyGameState>,
): SessionState {
  return {
    sessionId: 'mock-session',
    sessionCode: 'MOCK',
    players: players ?? MOCK_PLAYERS,
    gameState: makeGameState(phaseState, gameStateOverrides),
    revision: 1,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
  };
}
