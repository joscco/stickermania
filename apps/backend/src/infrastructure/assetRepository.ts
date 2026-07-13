import type {Readable} from "node:stream";

export interface SavedAsset {
  assetPath: string;
  publicUrl: string;
}

export interface SessionAssetInfo {
  type: "avatar" | "sticker";
  filename: string;
  publicUrl: string;
}

export interface ReadAssetResult {
  contentType: string;
  stream: Readable;
}

export interface AssetRepository {
  saveAvatar(args: { sessionId: string; playerId: string; playerName: string; imageDataUrl: string }): Promise<SavedAsset>;
  saveSticker(args: { sessionId: string; playerId: string; playerName: string; stickerId: string; imageDataUrl: string }): Promise<SavedAsset>;
  saveStickerLayer(args: { sessionId: string; stickerId: string; layer: "base" | "paint"; imageDataUrl: string }): Promise<SavedAsset>;
  deleteSticker(args: { assetPath: string }): Promise<void>;
  listSessionAssets(sessionId: string): Promise<SessionAssetInfo[]>;
  readAsset(assetPath: string): Promise<ReadAssetResult | null>;
}
