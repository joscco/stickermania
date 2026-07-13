import type {PlayerSticker} from "@birthday/shared";
import {PlayerStickerLibraryCommand, PlayerStickerLibraryCommandService} from "./player-sticker-library.commands";

const sticker = (overrides: Partial<PlayerSticker> = {}): PlayerSticker => ({
  id: "sticker-1",
  ownerPlayerId: "player-1",
  name: "Sticker",
  imageUrl: "data:image/png;base64,abc",
  assetPath: "stickers/sticker-1.png",
  createdAt: 1,
  ...overrides,
});

describe("PlayerStickerLibraryCommandService", () => {
  it("normalizes pack names before emitting createPack", () => {
    const commands: PlayerStickerLibraryCommand[] = [];
    const service = new PlayerStickerLibraryCommandService(command => commands.push(command));

    expect(service.requestCreatePack("  Neue   Box  ")).toBe(true);

    expect(commands).toEqual([
      {type: "createPack", name: "Neue Box"},
    ]);
  });

  it("ignores empty pack names", () => {
    const commands: PlayerStickerLibraryCommand[] = [];
    const service = new PlayerStickerLibraryCommandService(command => commands.push(command));

    expect(service.requestCreatePack("   ")).toBe(false);

    expect(commands).toEqual([]);
  });

  it("does not delete the default pack", () => {
    const commands: PlayerStickerLibraryCommand[] = [];
    const service = new PlayerStickerLibraryCommandService(command => commands.push(command));

    expect(service.requestDeletePack({packId: "player-1", defaultPackId: "player-1"})).toBe(false);

    expect(commands).toEqual([]);
  });

  it("emits moveStickerToPack only for real drops into a different pack", () => {
    const commands: PlayerStickerLibraryCommand[] = [];
    const service = new PlayerStickerLibraryCommandService(command => commands.push(command));

    expect(service.moveStickerToPackAfterDrop({
      sticker: sticker({packId: "pack-a"}),
      targetPackId: "pack-b",
      wasDragging: true,
      ownPackIds: new Set(["player-1", "pack-a", "pack-b"]),
      defaultPackId: "player-1",
    })).toBe(true);

    expect(commands).toEqual([
      {type: "moveStickerToPack", stickerId: "sticker-1", packId: "pack-b"},
    ]);
  });

  it("ignores drops into the current pack", () => {
    const commands: PlayerStickerLibraryCommand[] = [];
    const service = new PlayerStickerLibraryCommandService(command => commands.push(command));

    expect(service.moveStickerToPackAfterDrop({
      sticker: sticker({packId: "pack-a"}),
      targetPackId: "pack-a",
      wasDragging: true,
      ownPackIds: new Set(["player-1", "pack-a"]),
      defaultPackId: "player-1",
    })).toBe(false);

    expect(commands).toEqual([]);
  });
});
