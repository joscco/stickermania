export interface SavedAsset {
  assetPath: string;
  publicUrl: string;
}

export interface AssetRepository {
  saveAvatar(args: { sessionId: string; playerId: string; playerName: string; imageDataUrl: string }): Promise<SavedAsset>;
  saveDrawing(args: { sessionId: string; playerId: string; playerName: string; drawingId: string; prompt: string; imageDataUrl: string }): Promise<SavedAsset>;
  saveCollage(args: { sessionId: string; playerId: string; playerName: string; collageId: string; imageDataUrl: string }): Promise<SavedAsset>;
}
