import type {PlayerSticker, StickerPack} from "@birthday/shared";
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";

export type StickerPackSection = StickerPack & {stickers: PlayerSticker[]};

export function playerDefaultPackId(playerId: string): string {
  return `player-${playerId}`;
}

export function buildOwnStickerPacks(args: {
  playerId: string;
  defaultPackId: string;
  stickerPacks: StickerPack[];
}): StickerPack[] {
  if (!args.playerId) {
    return [];
  }

  const packs = args.stickerPacks.filter(pack => packOwnerId(pack) === args.playerId || pack.id === args.defaultPackId);
  const defaultPack = packs.find(pack => pack.id === args.defaultPackId) ?? {
    id: args.defaultPackId,
    name: "Meine Sticker",
    ownerPlayerId: args.playerId,
    stickerIds: [],
  };

  return [
    defaultPack,
    ...packs
      .filter(pack => pack.id !== args.defaultPackId)
      .sort((left, right) => (left.createdAt ?? Number.MAX_SAFE_INTEGER) - (right.createdAt ?? Number.MAX_SAFE_INTEGER)),
  ];
}

export function buildStickerPackSections(args: {
  stickers: PlayerSticker[];
  ownStickerPacks: StickerPack[];
  defaultPackId: string;
}): StickerPackSection[] {
  const ownPackIds = new Set(args.ownStickerPacks.map(pack => pack.id));

  return args.ownStickerPacks.map(pack => ({
    ...pack,
    stickers: args.stickers.filter(sticker => effectiveStickerPackId(sticker, ownPackIds, args.defaultPackId) === pack.id),
  }));
}

export function effectiveStickerPackId(
  sticker: PlayerSticker,
  ownPackIds: ReadonlySet<string>,
  defaultPackId: string,
): string {
  return sticker.packId && ownPackIds.has(sticker.packId) ? sticker.packId : defaultPackId;
}

export function packOwnerId(pack: StickerPack): string | null {
  if (pack.ownerPlayerId) {
    return pack.ownerPlayerId;
  }

  if (!pack.id.startsWith("player-")) {
    return null;
  }

  return pack.id.slice("player-".length) || null;
}

export function normalizedPackName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, STICKERMANIA_CONFIG.stickerPacks.maxNameLength);
}
