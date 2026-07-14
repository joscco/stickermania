import type {PlayerSticker, StickerPack} from "@stickermania/shared";
import {
  buildOwnStickerPacks,
  buildStickerPackSections,
  effectiveStickerPackId,
  normalizedPackName,
  packOwnerId,
} from "./player-sticker-library.model";

const sticker = (overrides: Partial<PlayerSticker> = {}): PlayerSticker => ({
  id: "sticker-1",
  ownerPlayerId: "player-1",
  name: "Sticker",
  imageUrl: "data:image/png;base64,abc",
  assetPath: "stickers/sticker-1.png",
  createdAt: 1,
  ...overrides,
});

const pack = (overrides: Partial<StickerPack> = {}): StickerPack => ({
  id: "pack-1",
  name: "Pack",
  stickerIds: [],
  ownerPlayerId: "player-1",
  ...overrides,
});

describe("player-sticker-library.model", () => {
  it("keeps the default pack first and sorts additional packs by createdAt", () => {
    const result = buildOwnStickerPacks({
      playerId: "player-1",
      defaultPackId: "player-1",
      stickerPacks: [
        pack({id: "late", createdAt: 20}),
        pack({id: "player-1", name: "Default", createdAt: 50}),
        pack({id: "early", createdAt: 10}),
      ],
    });

    expect(result.map(item => item.id)).toEqual(["player-1", "early", "late"]);
  });

  it("creates a fallback default pack when none exists", () => {
    const result = buildOwnStickerPacks({
      playerId: "player-1",
      defaultPackId: "player-1",
      stickerPacks: [],
    });

    expect(result[0]).toEqual({
      id: "player-1",
      name: "Meine Sticker",
      ownerPlayerId: "player-1",
      stickerIds: [],
    });
  });

  it("groups stickers into pack sections and falls back to default pack", () => {
    const result = buildStickerPackSections({
      stickers: [
        sticker({id: "default-sticker", packId: undefined}),
        sticker({id: "custom-sticker", packId: "custom"}),
        sticker({id: "missing-pack-sticker", packId: "deleted-pack"}),
      ],
      ownStickerPacks: [
        pack({id: "player-1"}),
        pack({id: "custom"}),
      ],
      defaultPackId: "player-1",
    });

    expect(result.map(section => [section.id, section.stickers.map(item => item.id)])).toEqual([
      ["player-1", ["default-sticker", "missing-pack-sticker"]],
      ["custom", ["custom-sticker"]],
    ]);
  });

  it("resolves pack owner ids from explicit owner or player-prefixed ids", () => {
    expect(packOwnerId(pack({ownerPlayerId: "explicit"}))).toBe("explicit");
    expect(packOwnerId(pack({id: "player-fallback", ownerPlayerId: undefined}))).toBe("fallback");
    expect(packOwnerId(pack({id: "global", ownerPlayerId: undefined}))).toBeNull();
  });

  it("normalizes pack names", () => {
    expect(normalizedPackName("  Sehr   coole   Sticker  ")).toBe("Sehr coole Sticker");
  });

  it("falls back to default pack if the sticker pack is not owned", () => {
    expect(effectiveStickerPackId(
      sticker({packId: "deleted-pack"}),
      new Set(["player-1"]),
      "player-1",
    )).toBe("player-1");
  });
});
