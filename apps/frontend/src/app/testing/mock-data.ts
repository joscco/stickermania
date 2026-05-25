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
  'shapes-triangle', 'shapes-rectangle', 'shapes-diamond', 'shapes-star',
  'shapes-flower', 'shapes-wobble', 'shapes-heart', 'shapes-egg',
  'circles-circle', 'circles-circle-filled',
  'eyes-open', 'eyes-closed',
];

// eslint-disable-next-line @typescript-eslint/no-var-requires
const hitboxData: Record<string, any> = require('../../../../../hitbox-data.json');

function getHitboxFor(id: string): StickerDefinition['hitboxPolygon'] {
  const raw = (hitboxData as Record<string, any>)[id];
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Array.isArray(raw.polygon)) return raw.polygon;
  return undefined;
}

function getOverlayFor(id: string): StickerDefinition['overlayBounds'] {
  const raw = (hitboxData as Record<string, any>)[id];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  return raw.overlayBounds;
}

export const MOCK_CATALOG: StickerDefinition[] = MOCK_STICKER_IDS.map(id => ({
  id,
  imageUrl: `sprite:#sticker-${id}`,
  packId: 'pack_shapes',
  hitboxPolygon: getHitboxFor(id),
  overlayBounds: getOverlayFor(id),
}));

export const MOCK_SHAPES_PACK: StickerPack = {
  id: 'pack_shapes',
  name: 'Shapes',
  stickerIds: MOCK_STICKER_IDS,
  unlockedAtStart: true,
  iconId: 'pack-icon-shapes',
};

export const MOCK_HOME_PACK: StickerPack = {
  id: 'pack_home',
  name: 'Home',
  stickerIds: MOCK_STICKER_IDS,
  unlockedAtStart: true,
  iconId: 'pack-icon-home',
}

export const MOCK_LINES_PACK: StickerPack = {
  id: 'pack_lines',
  name: 'Lines',
  stickerIds: MOCK_STICKER_IDS,
  unlockedAtStart: true,
  iconId: 'pack-icon-lines',
}

export const MOCK_PLAYERS: Record<string, SessionPlayer> = {
  'player-1': { id: 'player-1', name: 'Anna', avatarUrl: 'assets/png/example_avatar_player_1.png', avatarAssetPath: null, score: 120, joinedAt: 0, connected: true, isHost: true, teamId: null },
  'player-2': { id: 'player-2', name: 'Bruno', avatarUrl: 'assets/png/example_avatar_player_2.png', avatarAssetPath: null, score: 80, joinedAt: 0, connected: true, isHost: false, teamId: null },
  'player-3': { id: 'player-3', name: 'Carl', avatarUrl: 'assets/png/example_avatar_player_3.png', avatarAssetPath: null, score: 60, joinedAt: 0, connected: true, isHost: false, teamId: null },
};

const MOCK_PLACEMENTS: StickerPlacement[] = [
  { instanceId: 'i1', stickerId: 'shapes-heart', x: 20, y: 20, rotation: 0, scale: 1.0, zIndex: 1 },
  { instanceId: 'i2', stickerId: 'mouths-lips', x: 50, y: 100, rotation: 10, scale: 1.2, zIndex: 2 },
  { instanceId: 'i3', stickerId: 'shapes-star', x: 120, y: 40, rotation: -15, scale: 0.8, zIndex: 3 },
];

const MOCK_PLACEMENTS_2: StickerPlacement[] = [
  { instanceId: 'i4', stickerId: 'shapes-diamond', x: 40, y: 60, rotation: 30, scale: 1.0, zIndex: 1 },
  { instanceId: 'i5', stickerId: 'eyes-open', x: 80, y: 80, rotation: 0, scale: 1.5, zIndex: 2 },
];

const MOCK_PLACEMENTS_3: StickerPlacement[] = [
  { instanceId: 'i6', stickerId: 'shapes-star', x: 60, y: 30, rotation: -10, scale: 1.0, zIndex: 1 },
  { instanceId: 'i7', stickerId: 'shapes-wobble', x: 30, y: 120, rotation: 20, scale: 0.9, zIndex: 2 },
];

export const MOCK_SUBMISSIONS: StickerCollage[] = [
  { id: 'col-1', playerId: 'player-1', roundIndex: 0, placements: MOCK_PLACEMENTS, submittedAt: Date.now() },
  { id: 'col-2', playerId: 'player-2', roundIndex: 0, placements: MOCK_PLACEMENTS_2, submittedAt: Date.now() },
  { id: 'col-3', playerId: 'player-3', roundIndex: 0, placements: MOCK_PLACEMENTS_3, submittedAt: Date.now() },
];

const MOCK_VOTE_RESULTS: StickerCollageVoteResult[] = [
  { collageId: 'col-1', playerId: 'player-1', voteCount: 2, placement: 1 },
  { collageId: 'col-2', playerId: 'player-2', voteCount: 1, placement: 2 },
  { collageId: 'col-3', playerId: 'player-3', voteCount: 0, placement: 3 },
];

// ── Phase state builders ────────────────────────────────────────────────────

export function lobbyPhase(): StickerCollageLobbyState {
  return { phase: 'LOBBY' };
}

export function buildingPhase(opts?: {
  skippedPlayerIds?: string[];
}): StickerCollageBuildingState {
  return {
    phase: 'BUILDING',
    roundEndsAt: Date.now() + 20_000,
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
    packUnlockChoices: ['pack_shapes', 'pack_home', 'pack_lines'],
    lastUnlockedPackId: null,
    winnerChoicesDone: false,
    tiedWinnerIds: [],
    readyToAdvanceIds: [],
  };
}

export function nextRoundPhase(): StickerCollageNextRoundSetupState {
  return { phase: 'NEXT_ROUND_SETUP' };
}

// ── Game state builder ───────────────────────────────────────────────────────

export function makeGameState(
  phaseState: StickerCollageBuildingState | StickerCollageVotingState | StickerCollageResultsState | StickerCollageLobbyState | StickerCollageNextRoundSetupState,
  overrides?: Partial<StickerCollageGameState>,
): StickerCollageGameState {
  const base: StickerCollageGameState = {
    currentRoundIndex: 0,
    currentPrompt: 'Das schönste Geburtstagsmonster',
    currentTask: null,
    currentRecommendedPackIds: [],
    roundStartedAt: Date.now() - 60_000,
    stickerCatalog: MOCK_CATALOG,
    stickerPacks: [MOCK_SHAPES_PACK, MOCK_HOME_PACK, MOCK_LINES_PACK],
    unlockedPackIds: ['pack_shapes'],
    submissions: {},
    minigameSubmissions: {},
    promptHistory: { 0: 'Das schönste Geburtstagsmonster' },
    roundParticipantIds: ['player-1', 'player-2', 'player-3'],
    maxStickersOnCanvas: 12,
    votesPerPlayer: 3,
    phaseState,
    roundDurationSec: 20,
    votingDurationSec: 120,
    resultsDurationSec: 60,
  };
  return overrides ? { ...base, ...overrides } : base;
}

// ── Session state builder ────────────────────────────────────────────────────

export function makeSessionState(
  phaseState: StickerCollageBuildingState | StickerCollageVotingState | StickerCollageResultsState | StickerCollageLobbyState | StickerCollageNextRoundSetupState,
  players?: Record<string, SessionPlayer>,
  gameStateOverrides?: Partial<StickerCollageGameState>,
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
