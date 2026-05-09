import type {
  SessionPlayer,
  SessionState,
  StickerCollageGameState,
  StickerCollage,
  StickerDefinition,
  StickerPack,
  StickerPlacement,
  StickerCollageLobbyState,
  StickerCollageBuildingState,
  StickerCollageVotingState,
  StickerCollageResultsState,
  StickerCollageNextRoundSetupState,
  StickerCollageVoteResult,
} from '@birthday/shared';

export const MOCK_STICKER_IDS = [
  'sticker_eye_heart', 'sticker_eye_round', 'sticker_eye_sleepy', 'sticker_eye_star',
  'sticker_fruit_apple', 'sticker_fruit_banana', 'sticker_fruit_cherry',
  'sticker_mouth_smile', 'sticker_mouth_tongue', 'sticker_shape_blob',
  'sticker_shape_star', 'sticker_nose_clown',
];

export const MOCK_CATALOG: StickerDefinition[] = MOCK_STICKER_IDS.map(id => ({
  id,
  imageUrl: `assets/png/${id}.png`,
  categories: ['general'],
}));

export const MOCK_PACK: StickerPack = {
  id: 'pack-1',
  name: 'Basis',
  stickerIds: MOCK_STICKER_IDS,
  unlockedAtStart: true,
  iconId: 'pack-icon-shapes',
};

export const MOCK_PLAYERS: Record<string, SessionPlayer> = {
  'player-1': { id: 'player-1', name: 'Anna', avatarUrl: 'assets/png/example_player_1.png', avatarAssetPath: null, score: 120, joinedAt: 0, connected: true, isHost: true, teamId: null },
  'player-2': { id: 'player-2', name: 'Bruno', avatarUrl: 'assets/png/example_player_2.png', avatarAssetPath: null, score: 80, joinedAt: 0, connected: true, isHost: false, teamId: null },
  'player-3': { id: 'player-3', name: 'Clara', avatarUrl: 'assets/png/example_player_3.png', avatarAssetPath: null, score: 60, joinedAt: 0, connected: true, isHost: false, teamId: null },
};

export const MOCK_PLAYERS_NO_NAME: Record<string, SessionPlayer> = {
  ...MOCK_PLAYERS,
  'player-1': { ...MOCK_PLAYERS['player-1'], name: '', avatarUrl: null },
};

export const MOCK_PLAYERS_NO_AVATAR: Record<string, SessionPlayer> = {
  ...MOCK_PLAYERS,
  'player-1': { ...MOCK_PLAYERS['player-1'], avatarUrl: null },
};

const MOCK_PLACEMENTS: StickerPlacement[] = [
  { instanceId: 'i1', stickerId: 'sticker_eye_heart', x: 20, y: 20, rotation: 0, scale: 1.0, zIndex: 1 },
  { instanceId: 'i2', stickerId: 'sticker_mouth_smile', x: 50, y: 100, rotation: 10, scale: 1.2, zIndex: 2 },
  { instanceId: 'i3', stickerId: 'sticker_shape_star', x: 120, y: 40, rotation: -15, scale: 0.8, zIndex: 3 },
];

const MOCK_PLACEMENTS_2: StickerPlacement[] = [
  { instanceId: 'i4', stickerId: 'sticker_fruit_banana', x: 40, y: 60, rotation: 30, scale: 1.0, zIndex: 1 },
  { instanceId: 'i5', stickerId: 'sticker_nose_clown', x: 80, y: 80, rotation: 0, scale: 1.5, zIndex: 2 },
];

const MOCK_PLACEMENTS_3: StickerPlacement[] = [
  { instanceId: 'i6', stickerId: 'sticker_eye_star', x: 60, y: 30, rotation: -10, scale: 1.0, zIndex: 1 },
  { instanceId: 'i7', stickerId: 'sticker_shape_blob', x: 30, y: 120, rotation: 20, scale: 0.9, zIndex: 2 },
];

const MOCK_SUBMISSIONS: StickerCollage[] = [
  { id: 'col-1', playerId: 'player-1', roundIndex: 0, placements: MOCK_PLACEMENTS, submittedAt: Date.now() },
  { id: 'col-2', playerId: 'player-2', roundIndex: 0, placements: MOCK_PLACEMENTS_2, submittedAt: Date.now() },
  { id: 'col-3', playerId: 'player-3', roundIndex: 0, placements: MOCK_PLACEMENTS_3, submittedAt: Date.now() },
];

const MOCK_VOTE_RESULTS: StickerCollageVoteResult[] = [
  { collageId: 'col-1', playerId: 'player-1', voteCount: 2, pointsAwarded: 100 },
  { collageId: 'col-2', playerId: 'player-2', voteCount: 1, pointsAwarded: 60 },
  { collageId: 'col-3', playerId: 'player-3', voteCount: 0, pointsAwarded: 0 },
];

// ── Phase state builders ────────────────────────────────────────────────────

export function lobbyPhase(): StickerCollageLobbyState {
  return { phase: 'LOBBY' };
}

export function buildingPhase(opts?: {
  skippedPlayerIds?: string[];
  playerHands?: Record<string, { stickerIds: string[]; swapsRemaining: number }>;
}): StickerCollageBuildingState {
  return {
    phase: 'BUILDING',
    roundEndsAt: Date.now() + 300_000,
    playerHands: opts?.playerHands ?? {
      'player-1': { stickerIds: MOCK_STICKER_IDS.slice(0, 8), swapsRemaining: 2 },
      'player-2': { stickerIds: MOCK_STICKER_IDS.slice(0, 8), swapsRemaining: 2 },
      'player-3': { stickerIds: MOCK_STICKER_IDS.slice(0, 8), swapsRemaining: 2 },
    },
    skippedPlayerIds: opts?.skippedPlayerIds ?? [],
  };
}

export function votingPhase(opts?: {
  currentVotes?: Record<string, string[]>;
  doneVotingIds?: string[];
}): StickerCollageVotingState {
  return {
    phase: 'VOTING',
    votingEndsAt: Date.now() + 120_000,
    currentVotes: opts?.currentVotes ?? {},
    doneVotingIds: opts?.doneVotingIds ?? [],
  };
}

export function resultsPhase(): StickerCollageResultsState {
  return {
    phase: 'RESULTS',
    resultsEndsAt: Date.now() + 60_000,
    lastVoteResults: MOCK_VOTE_RESULTS,
    winnerId: 'player-1',
    promptChoices: ['Das gruseligste Tier', 'Mein Traumfrühstück', 'Ein Roboter im Urlaub'],
    packUnlockChoices: [],
    guaranteedPackChoices: [],
    lastUnlockedPackId: null,
    winnerChoicesDone: false,
    readyToAdvanceIds: [],
  };
}

export function nextRoundPhase(): StickerCollageNextRoundSetupState {
  return { phase: 'NEXT_ROUND_SETUP' };
}

// ── Game state builder ───────────────────────────────────────────────────────

const BASE_GAME_STATE = {
  currentRoundIndex: 0,
  currentPrompt: 'Das schönste Geburtstagsmonster',
  roundStartedAt: Date.now() - 60_000,
  stickerCatalog: MOCK_CATALOG,
  stickerPacks: [MOCK_PACK] as StickerPack[],
  unlockedPackIds: ['pack-1'],
  guaranteedPackId: null,
  submissions: { 0: MOCK_SUBMISSIONS } as Record<number, StickerCollage[]>,
  promptHistory: { 0: 'Das schönste Geburtstagsmonster' },
  roundParticipantIds: ['player-1', 'player-2', 'player-3'],
  handSize: 8,
  maxStickersOnCanvas: 12,
  votesPerPlayer: 3,
};

export function makeGameState(
  phaseState: StickerCollageBuildingState | StickerCollageVotingState | StickerCollageResultsState | StickerCollageLobbyState | StickerCollageNextRoundSetupState,
  overrides?: Partial<StickerCollageGameState>,
): StickerCollageGameState {
  return { ...BASE_GAME_STATE, phaseState, ...overrides };
}

// ── Session state builder ────────────────────────────────────────────────────

export function makeSessionState(
  phaseState: Parameters<typeof makeGameState>[0],
  players?: Record<string, SessionPlayer>,
): SessionState {
  return {
    sessionId: 'mock-session',
    sessionCode: 'MOCK',
    players: players ?? MOCK_PLAYERS,
    gameState: makeGameState(phaseState),
    revision: 1,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
  };
}