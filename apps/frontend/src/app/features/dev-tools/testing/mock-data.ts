import type {BoardStickerPlacement, PlayerSticker, SessionPlayer, SessionState, StickerCollageGameState, StickerDefinition, StickerPack,} from '@stickermania/shared';

export const MOCK_STICKER_IDS = [
  'shapes-triangle', 'shapes-rectangle', 'shapes-diamond', 'shapes-star',
  'shapes-flower', 'shapes-wobble', 'shapes-heart', 'shapes-egg',
  'circles-circle', 'circles-circle-filled',
  'eyes-open', 'eyes-closed',
];

export const MOCK_CATALOG: StickerDefinition[] = MOCK_STICKER_IDS.map(id => ({
  id,
  imageUrl: `sprite:#sticker-${id}`,
  packId: 'pack_shapes',
}));

export const MOCK_SHAPES_PACK: StickerPack = {
  id: 'pack_shapes',
  name: 'Shapes',
  stickerIds: MOCK_STICKER_IDS,
  iconId: 'image-stickers',
};

export const MOCK_PLAYERS: Record<string, SessionPlayer> = {
  'player-1': { id: 'player-1', name: 'Anna', avatarUrl: 'assets/png/example_avatar_player_1.png', avatarAssetPath: null, score: 0, joinedAt: 0, connected: true, isHost: true, teamId: null },
  'player-2': { id: 'player-2', name: 'Bruno', avatarUrl: 'assets/png/example_avatar_player_2.png', avatarAssetPath: null, score: 0, joinedAt: 0, connected: true, isHost: false, teamId: null },
  'player-3': { id: 'player-3', name: 'Carl', avatarUrl: 'assets/png/example_avatar_player_3.png', avatarAssetPath: null, score: 0, joinedAt: 0, connected: true, isHost: false, teamId: null },
};

export const MOCK_PLAYER_STICKERS: Record<string, PlayerSticker[]> = {
  'player-1': [
    {id: 'mock-sticker-heart', ownerPlayerId: 'player-1', imageUrl: 'sprite:#sticker-shapes-heart', assetPath: 'mock', createdAt: Date.now() - 2000},
    {id: 'mock-sticker-star', ownerPlayerId: 'player-1', imageUrl: 'sprite:#sticker-shapes-star', assetPath: 'mock', createdAt: Date.now() - 1000},
  ],
  'player-2': [
    {id: 'mock-sticker-wobble', ownerPlayerId: 'player-2', imageUrl: 'sprite:#sticker-shapes-wobble', assetPath: 'mock', createdAt: Date.now() - 500},
  ],
};

export const MOCK_BOARD_PLACEMENTS: BoardStickerPlacement[] = [
  {instanceId: 'i1', stickerId: 'mock-sticker-heart', ownerPlayerId: 'player-1', placedByPlayerId: 'player-1', updatedAt: Date.now(), x: -180, y: -80, rotation: -8, scale: 1.2, zIndex: 1},
  {instanceId: 'i2', stickerId: 'mock-sticker-star', ownerPlayerId: 'player-1', placedByPlayerId: 'player-1', updatedAt: Date.now(), x: 80, y: 20, rotation: 18, scale: 0.9, zIndex: 2},
  {instanceId: 'i3', stickerId: 'mock-sticker-wobble', ownerPlayerId: 'player-2', placedByPlayerId: 'player-2', updatedAt: Date.now(), x: 260, y: -120, rotation: 12, scale: 1.1, zIndex: 3},
];

export function makeGameState(overrides?: Partial<StickerCollageGameState>): StickerCollageGameState {
  const base: StickerCollageGameState = {
    stickerCatalog: MOCK_CATALOG,
    stickerPacks: [MOCK_SHAPES_PACK],
    playerStickers: MOCK_PLAYER_STICKERS,
    boardPlacements: MOCK_BOARD_PLACEMENTS,
  };
  return overrides ? {...base, ...overrides} : base;
}

export function makeSessionState(
  players?: Record<string, SessionPlayer>,
  gameStateOverrides?: Partial<StickerCollageGameState>,
): SessionState {
  return {
    sessionId: 'mock-session',
    sessionCode: 'MOCK',
    players: players ?? MOCK_PLAYERS,
    gameState: makeGameState(gameStateOverrides),
    revision: 1,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
  };
}
