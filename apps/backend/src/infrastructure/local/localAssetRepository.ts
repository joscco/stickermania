import fs from "node:fs";
import path from "node:path";
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
import type { AssetRepository, ReadAssetResult, SavedAsset, SessionAssetInfo } from "../assetRepository.js";

function sanitize(input: string): string {
  return input
    .replace(/[,.\-;:!?"'(){}[\]\/\\@#$%^&*+=<>~`|]/g, "")
    .replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, STICKERMANIA_CONFIG.stickers.maxAssetFilenamePartLength);
}

function decodePngDataUrl(imageDataUrl: string): Buffer {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}

export class LocalAssetRepository implements AssetRepository {
  public constructor(private readonly dataRoot: string) {}

  public async saveAvatar(args: { sessionId: string; playerId: string; playerName: string; imageDataUrl: string }): Promise<SavedAsset> {
    const relativePath = path.posix.join("assets", args.sessionId, "avatars", `avatar_${sanitize(args.playerName)}_${args.playerId}.png`);
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return {
      assetPath: relativePath,
      publicUrl: `/api/assets/${relativePath.replace(/^assets\//u, "")}`,
    };
  }

  public async saveSticker(args: { sessionId: string; playerId: string; playerName: string; stickerId: string; imageDataUrl: string }): Promise<SavedAsset> {
    const relativePath = path.posix.join(
      "assets",
      args.sessionId,
      "stickers",
      `sticker_${sanitize(args.playerName)}_${args.stickerId}.png`,
    );
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return {
      assetPath: relativePath,
      publicUrl: `/api/assets/${relativePath.replace(/^assets\//u, "")}`,
    };
  }

  public async saveStickerLayer(args: {sessionId: string; stickerId: string; layer: "base" | "paint"; imageDataUrl: string}): Promise<SavedAsset> {
    const relativePath = path.posix.join(
      "assets",
      args.sessionId,
      "stickers",
      `editor_${sanitize(args.stickerId)}_${args.layer}.png`,
    );
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return {
      assetPath: relativePath,
      publicUrl: `/api/assets/${relativePath.replace(/^assets\//u, "")}`,
    };
  }


  public async deleteSticker(args: { assetPath: string }): Promise<void> {
    const normalized = args.assetPath.replace(/^\/+/u, "");
    if (!normalized.startsWith("assets/") || !normalized.includes("/stickers/") || normalized.includes("..")) {
      return;
    }

    const absolutePath = path.resolve(this.dataRoot, normalized);
    const assetsRoot = path.resolve(this.dataRoot, "assets");

    if (!absolutePath.startsWith(assetsRoot + path.sep)) {
      return;
    }

    try {
      await fs.promises.unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }

      throw error;
    }
  }

  public async listSessionAssets(sessionId: string): Promise<SessionAssetInfo[]> {
    const sessionAssetsPath = path.resolve(this.dataRoot, "assets", sessionId);
    const result: SessionAssetInfo[] = [];

    for (const subdir of ["avatars", "stickers"] as const) {
      const dir = path.join(sessionAssetsPath, subdir);
      if (!fs.existsSync(dir)) continue;
      for (const filename of fs.readdirSync(dir)) {
        if (!filename.endsWith(".png") || filename.startsWith("editor_")) continue;
        result.push({
          type: subdir === "avatars" ? "avatar" : "sticker",
          filename,
          publicUrl: `/api/assets/${sessionId}/${subdir}/${filename}`,
        });
      }
    }

    return result;
  }

  public async readAsset(assetPath: string): Promise<ReadAssetResult | null> {
    const normalized = assetPath.replace(/^\/+/u, "");
    if (normalized.includes("..")) return null;
    const absolutePath = path.resolve(this.dataRoot, "assets", normalized);
    const assetsRoot = path.resolve(this.dataRoot, "assets");
    if (!absolutePath.startsWith(assetsRoot + path.sep)) return null;

    try {
      await fs.promises.access(absolutePath, fs.constants.R_OK);
      return {
        contentType: "image/png",
        stream: fs.createReadStream(absolutePath),
      };
    } catch {
      return null;
    }
  }

  private async writeBuffer(relativePath: string, buffer: Buffer): Promise<void> {
    const absolutePath = path.resolve(this.dataRoot, relativePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);
  }
}
