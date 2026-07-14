import type {PlayerSticker} from "@stickermania/shared";
import {effectiveStickerPackId, normalizedPackName} from "./player-sticker-library.model";

export type PlayerStickerLibraryCommand =
  | {type: "selectSticker"; sticker: PlayerSticker}
  | {type: "deleteSticker"; sticker: PlayerSticker}
  | {type: "createPack"; name: string}
  | {type: "deletePack"; packId: string}
  | {type: "moveStickerToPack"; stickerId: string; packId: string};

export type PlayerStickerLibraryCommandSink = (command: PlayerStickerLibraryCommand) => void;

export class PlayerStickerLibraryCommandService {
  constructor(private readonly emitCommand: PlayerStickerLibraryCommandSink) {}

  selectSticker(sticker: PlayerSticker): void {
    this.emitCommand({type: "selectSticker", sticker});
  }

  deleteSticker(sticker: PlayerSticker): void {
    this.emitCommand({type: "deleteSticker", sticker});
  }

  requestCreatePack(rawName: string): boolean {
    const name = normalizedPackName(rawName);

    if (!name) {
      return false;
    }

    this.emitCommand({type: "createPack", name});
    return true;
  }

  requestDeletePack(args: {packId: string; defaultPackId: string}): boolean {
    if (args.packId === args.defaultPackId) {
      return false;
    }

    this.emitCommand({type: "deletePack", packId: args.packId});
    return true;
  }

  moveStickerToPackAfterDrop(args: {
    sticker: PlayerSticker;
    targetPackId: string | null;
    wasDragging: boolean;
    ownPackIds: ReadonlySet<string>;
    defaultPackId: string;
  }): boolean {
    if (!args.wasDragging || !args.targetPackId) {
      return false;
    }

    const currentPackId = effectiveStickerPackId(args.sticker, args.ownPackIds, args.defaultPackId);

    if (currentPackId === args.targetPackId) {
      return false;
    }

    this.emitCommand({
      type: "moveStickerToPack",
      stickerId: args.sticker.id,
      packId: args.targetPackId,
    });

    return true;
  }
}
