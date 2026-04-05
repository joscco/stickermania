import fs from "node:fs";
import path from "node:path";
import type { AssetRepository, SavedAsset } from "../assetRepository.js";

function sanitize(input: string): string {
  return input
    .replace(/[,.\-;:!?"'(){}[\]\/\\@#$%^&*+=<>~`|]/g, "")
    .replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function decodePngDataUrl(imageDataUrl: string): Buffer {
  const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  return Buffer.from(base64, "base64");
}

export class LocalAssetRepository implements AssetRepository {
  public constructor(private readonly dataRoot: string) {}

  public async saveAvatar(args: { sessionId: string; playerId: string; playerName: string; imageDataUrl: string }): Promise<SavedAsset> {
    const relativePath = path.posix.join("assets", args.sessionId, "avatars", `${sanitize(args.playerName)}-${args.playerId}.png`);
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return {
      assetPath: relativePath,
      publicUrl: `/api/assets/${relativePath.replace(/^assets\//u, "")}`,
    };
  }

  public async saveDrawing(args: { sessionId: string; playerId: string; playerName: string; drawingId: string; prompt: string; imageDataUrl: string }): Promise<SavedAsset> {
    const relativePath = path.posix.join(
      "assets",
      args.sessionId,
      "drawings",
      `${sanitize(args.playerName)}-${sanitize(args.prompt)}-${args.drawingId}.png`,
    );
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return {
      assetPath: relativePath,
      publicUrl: `/api/assets/${relativePath.replace(/^assets\//u, "")}`,
    };
  }

  public async saveCollage(args: { sessionId: string; playerId: string; playerName: string; collageId: string; imageDataUrl: string }): Promise<SavedAsset> {
    const relativePath = path.posix.join(
      "assets",
      args.sessionId,
      "collages",
      `${sanitize(args.playerName)}-${args.collageId}.png`,
    );
    await this.writeBuffer(relativePath, decodePngDataUrl(args.imageDataUrl));
    return {
      assetPath: relativePath,
      publicUrl: `/api/assets/${relativePath.replace(/^assets\//u, "")}`,
    };
  }

  private async writeBuffer(relativePath: string, buffer: Buffer): Promise<void> {
    const absolutePath = path.resolve(this.dataRoot, relativePath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);
  }
}
