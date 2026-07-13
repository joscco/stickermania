import type {
  BoardStickerPlacement,
  PlayerSticker,
  SessionPlayer,
  StickerDefinition,
  StickerPack,
} from "@birthday/shared";

export type PlacementBadge = {
  name: string;
  avatarUrl: string | null;
};

export type PlacementBadges = Record<string, PlacementBadge>;

export function buildDefaultStickerIds(defaultStickerCatalog: StickerDefinition[]): Set<string> {
  return new Set(defaultStickerCatalog.map(sticker => sticker.id));
}

export function buildCreatedStickerCatalog(
  stickers: PlayerSticker[],
  defaultStickerIds: ReadonlySet<string>,
): StickerDefinition[] {
  return stickers
    .filter(sticker => !defaultStickerIds.has(sticker.id))
    .map(sticker => ({
      id: sticker.id,
      name: sticker.name,
      imageUrl: sticker.imageUrl,
      packId: sticker.packId ?? playerPackId(sticker.ownerPlayerId),
      ownerPlayerId: sticker.ownerPlayerId,
      createdAt: sticker.createdAt,
    }));
}

export function buildStickerCatalog(
  defaultStickerCatalog: StickerDefinition[],
  createdStickerCatalog: StickerDefinition[],
): StickerDefinition[] {
  return [
    ...defaultStickerCatalog,
    ...createdStickerCatalog,
  ];
}

export function buildCreatedStickerPacks(args: {
  defaultStickerPacks: StickerPack[];
  stickers: PlayerSticker[];
  defaultStickerIds: ReadonlySet<string>;
  players: Record<string, SessionPlayer>;
  currentPlayerId: string;
}): StickerPack[] {
  const knownPackIds = new Set(args.defaultStickerPacks.map(pack => pack.id));
  const stickerIdsByPackId = new Map<string, string[]>();

  for (const sticker of args.stickers) {
    if (args.defaultStickerIds.has(sticker.id)) {
      continue;
    }

    const packId = sticker.packId ?? playerPackId(sticker.ownerPlayerId);

    if (knownPackIds.has(packId)) {
      continue;
    }

    stickerIdsByPackId.set(packId, [
      ...(stickerIdsByPackId.get(packId) ?? []),
      sticker.id,
    ]);
  }

  return [...stickerIdsByPackId.entries()].map(([packId, stickerIds]) => {
    const ownerPlayerId = fallbackPackOwnerId(packId);
    const ownerName = ownerPlayerId ? args.players[ownerPlayerId]?.name?.trim() : "";

    return {
      id: packId,
      name: ownerPlayerId === args.currentPlayerId ? "Meine Sticker" : ownerName || "Spieler",
      ownerPlayerId: ownerPlayerId ?? undefined,
      stickerIds,
    };
  });
}

export function buildStickerPacks(
  createdStickerPacks: StickerPack[],
  defaultStickerPacks: StickerPack[],
): StickerPack[] {
  return [
    ...createdStickerPacks,
    ...defaultStickerPacks,
  ];
}

export function buildPlacementBadges(
  placements: BoardStickerPlacement[],
  players: Record<string, SessionPlayer>,
): PlacementBadges {
  const badges: PlacementBadges = {};

  for (const placement of placements) {
    const player = players[placement.ownerPlayerId] ?? players[placement.placedByPlayerId];

    badges[placement.instanceId] = {
      name: player?.name?.trim() || "Spieler",
      avatarUrl: player?.avatarUrl ?? null,
    };
  }

  return badges;
}

export function editablePlacementIdsForPlayer(
  placements: BoardStickerPlacement[],
  playerId: string,
): string[] {
  return placements
    .filter(placement => wasPlacementPlacedByPlayer(placement, playerId))
    .map(placement => placement.instanceId);
}

export function wasPlacementPlacedByPlayer(
  placement: BoardStickerPlacement,
  playerId: string,
): boolean {
  return placement.placedByPlayerId
    ? placement.placedByPlayerId === playerId
    : placement.ownerPlayerId === playerId;
}

export function fallbackPackOwnerId(packId: string): string | null {
  if (!packId.startsWith("player-")) {
    return null;
  }

  return packId.slice("player-".length) || null;
}

function playerPackId(playerId: string): string {
  return `player-${playerId}`;
}
