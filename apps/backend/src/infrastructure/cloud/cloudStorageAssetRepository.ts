import path from "node:path";
import {Storage} from "@google-cloud/storage";
import {STICKERMANIA_CONFIG} from "@birthday/shared/stickermaniaConfig";
import type {AssetRepository, ReadAssetResult, SavedAsset, SessionAssetInfo} from "../assetRepository.js";

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

export class CloudStorageAssetRepository implements AssetRepository {
  private readonly storage: Storage;

  public constructor(args: {projectId?: string | null; bucketName: string}) {
    this.storage = new Storage({
      ...(args.projectId ? {projectId: args.projectId} : {}),
    });
    this.bucketName = args.bucketName;
  }

  private readonly bucketName: string;

  public async saveAvatar(args: { sessionId: string; playerId: string; playerName: string; imageDataUrl: string }): Promise<SavedAsset> {
    const relativePath = path.posix.join("assets", args.sessionId, "avatars", `avatar_${sanitize(args.playerName)}_${args.playerId}.png`);
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return this.savedAsset(relativePath);
  }

  public async saveSticker(args: { sessionId: string; playerId: string; playerName: string; stickerId: string; imageDataUrl: string }): Promise<SavedAsset> {
    const relativePath = path.posix.join(
      "assets",
      args.sessionId,
      "stickers",
      `sticker_${sanitize(args.playerName)}_${args.stickerId}.png`,
    );
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return this.savedAsset(relativePath);
  }

  public async saveStickerLayer(args: {sessionId: string; stickerId: string; layer: "base" | "paint"; imageDataUrl: string}): Promise<SavedAsset> {
    const relativePath = path.posix.join(
      "assets",
      args.sessionId,
      "stickers",
      `editor_${sanitize(args.stickerId)}_${args.layer}.png`,
    );
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return this.savedAsset(relativePath);
  }

  public async deleteSticker(args: { assetPath: string }): Promise<void> {
    const relativePath = args.assetPath.replace(/^\/+/u, "");
    if (!relativePath.startsWith("assets/") || !relativePath.includes("/stickers/") || relativePath.includes("..")) {
      return;
    }

    try {
      await this.bucket().file(relativePath).delete();
    } catch (error) {
      const statusCode = (error as {code?: number}).code;

      if (statusCode === 404) {
        return;
      }

      throw error;
    }
  }

  public async listSessionAssets(sessionId: string): Promise<SessionAssetInfo[]> {
    const [files] = await this.bucket().getFiles({prefix: `assets/${sessionId}/`});
    return files
      .map(file => {
        const parts = file.name.split("/");
        const subdir = parts[2];
        const filename = parts[3];
        if (!filename || (subdir !== "avatars" && subdir !== "stickers") || !filename.endsWith(".png") || filename.startsWith("editor_")) {
          return null;
        }
        return {
          type: subdir === "avatars" ? "avatar" as const : "sticker" as const,
          filename,
          publicUrl: `/api/assets/${sessionId}/${subdir}/${filename}`,
        };
      })
      .filter((asset): asset is SessionAssetInfo => asset !== null);
  }

  public async readAsset(assetPath: string): Promise<ReadAssetResult | null> {
    const normalized = assetPath.replace(/^\/+/u, "");
    if (normalized.includes("..")) return null;
    const objectName = normalized.startsWith("assets/") ? normalized : `assets/${normalized}`;
    const file = this.bucket().file(objectName);
    const [exists] = await file.exists();
    if (!exists) return null;
    return {
      contentType: "image/png",
      stream: file.createReadStream(),
    };
  }

  private async writeBuffer(relativePath: string, buffer: Buffer): Promise<void> {
    await this.bucket().file(relativePath).save(buffer, {
      resumable: false,
      contentType: "image/png",
      metadata: {
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  }

  private savedAsset(relativePath: string): SavedAsset {
    return {
      assetPath: relativePath,
      publicUrl: `/api/assets/${relativePath.replace(/^assets\//u, "")}`,
    };
  }

  private bucket() {
    return this.storage.bucket(this.bucketName);
  }
}
