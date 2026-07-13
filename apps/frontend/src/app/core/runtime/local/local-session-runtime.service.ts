import {Injectable} from "@angular/core";
import type {PlayerSticker, SessionInfo, SessionPlayer, SessionState, StickerAssetManifest, StickerDefinition} from "@birthday/shared";
import {createEmptySessionState} from "@birthday/shared/sessionState";
import {DEFAULT_GAME_CONFIG} from "@birthday/shared/stickermaniaConfig";
import {type ResolvedSessionInfo, type SessionSummary} from "../../api/session-api.service";
import {LocalSessionDb} from "./local-session-db";

const LAST_LOCAL_SESSION_ID_KEY = "stickermania_local_last_session_id";
const LOCAL_GAME_ID = "local-game";
const LOCAL_GAME_CODE = "LOCAL";
const LOCAL_GAME_BACKUP_FORMAT = "stickermania-local-game";
const LOCAL_ASSET_PREFIX = "local-asset:";
const LOCAL_ASSET_MAX_SIDE = 1280;
const LOCAL_ASSET_JPEG_QUALITY = 0.86;

interface LocalGameBackupAsset {
  assetId: string;
  dataUrl: string;
}

interface LocalGameBackup {
  format: typeof LOCAL_GAME_BACKUP_FORMAT;
  version: 1 | 2;
  exportedAt: number;
  state: SessionState;
  assets?: LocalGameBackupAsset[];
}

@Injectable({providedIn: "root"})
export class LocalSessionRuntimeService {
  private readonly objectUrls = new Map<string, string>();

  public constructor(private readonly db: LocalSessionDb) {}

  public async listSessions(): Promise<SessionSummary[]> {
    const sessions = (await this.db.listSessions()).filter(session => session.sessionId === LOCAL_GAME_ID);
    return sessions.map(session => ({
      sessionId: session.sessionId,
      sessionCode: session.sessionCode,
      playerCount: Object.keys(session.players).length,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
  }

  public async createSession(): Promise<SessionInfo> {
    return this.getOrCreateLocalGame();
  }

  public async getOrCreateLocalGame(): Promise<SessionInfo> {
    const existing = await this.db.getSession(LOCAL_GAME_ID);
    if (existing) {
      this.saveLastSessionId(existing.sessionId);
      return this.toSessionInfo(existing);
    }

    const state = createEmptySessionState({
      config: DEFAULT_GAME_CONFIG,
      sessionId: LOCAL_GAME_ID,
      sessionCode: LOCAL_GAME_CODE,
    });

    await this.db.saveSession(state);
    this.saveLastSessionId(state.sessionId);
    return this.toSessionInfo(state);
  }

  public async resetLocalGame(): Promise<SessionInfo> {
    await this.deleteSession(LOCAL_GAME_ID);
    return this.getOrCreateLocalGame();
  }

  public async resolveSessionByCode(sessionCode: string): Promise<ResolvedSessionInfo> {
    if (!sessionCode || sessionCode.toUpperCase() === LOCAL_GAME_CODE) {
      const info = await this.getOrCreateLocalGame();
      return {
        sessionId: info.sessionId,
        sessionCode: info.sessionCode,
        createdAt: info.createdAt,
        expiresAt: info.expiresAt,
      };
    }
    const state = await this.db.getSessionByCode(sessionCode);
    if (!state) {
      throw new Error("Session not found.");
    }
    this.saveLastSessionId(state.sessionId);
    return this.toResolvedSessionInfo(state);
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const existing = await this.db.getSession(sessionId);
    if (existing) {
      await this.deleteStateAssets(existing);
    }
    await this.db.deleteSession(sessionId);
    if (this.loadLastSessionId() === sessionId) {
      localStorage.removeItem(LAST_LOCAL_SESSION_ID_KEY);
    }
  }

  public async getSessionState(sessionId: string): Promise<SessionState> {
    const state = await this.loadPersistedSessionState(sessionId);
    return this.hydrateSessionState(state);
  }

  public async loadPersistedSessionState(sessionId: string): Promise<SessionState> {
    const state = await this.db.getSession(sessionId);
    if (!state) {
      throw new Error("Session not found.");
    }
    if (await this.migrateInlineDataUrlsToAssets(state)) {
      await this.savePersistedSessionState(state);
    }
    return state;
  }

  public async saveSessionState(state: SessionState): Promise<void> {
    await this.savePersistedSessionState(state);
  }

  public async savePersistedSessionState(state: SessionState): Promise<void> {
    await this.db.saveSession(state);
    this.saveLastSessionId(state.sessionId);
  }

  public createAssetRef(assetId: string): string {
    return `${LOCAL_ASSET_PREFIX}${assetId}`;
  }

  public isAssetRef(value: string | null | undefined): value is string {
    return typeof value === "string" && value.startsWith(LOCAL_ASSET_PREFIX);
  }

  public assetIdFromRef(value: string | null | undefined): string | null {
    return this.isAssetRef(value) ? value.slice(LOCAL_ASSET_PREFIX.length) : null;
  }

  public async saveDataUrlAsset(assetId: string, dataUrl: string): Promise<string> {
    const optimizedDataUrl = await this.optimizeDataUrlForStorage(dataUrl);
    await this.db.saveAsset(assetId, this.dataUrlToBlob(optimizedDataUrl));
    this.revokeObjectUrl(assetId);
    return this.createAssetRef(assetId);
  }

  public async deleteAssetRef(value: string | null | undefined): Promise<void> {
    const assetId = this.assetIdFromRef(value);
    if (!assetId) return;
    this.revokeObjectUrl(assetId);
    await this.db.deleteAsset(assetId);
  }

  public async resolveAssetUrl(value: string): Promise<string> {
    const assetId = this.assetIdFromRef(value);
    if (!assetId) return value;
    const existing = this.objectUrls.get(assetId);
    if (existing) return existing;

    const record = await this.db.getAsset(assetId);
    if (!record) return value;
    const url = URL.createObjectURL(record.blob);
    this.objectUrls.set(assetId, url);
    return url;
  }

  public async hydratePlayerSticker(sticker: PlayerSticker): Promise<PlayerSticker> {
    const hydrated = this.clone(sticker);
    hydrated.imageUrl = await this.resolveAssetUrl(hydrated.imageUrl);
    if (hydrated.editorData) {
      hydrated.editorData.baseImageUrl = await this.resolveAssetUrl(hydrated.editorData.baseImageUrl);
      hydrated.editorData.paintImageUrl = await this.resolveAssetUrl(hydrated.editorData.paintImageUrl);
    }
    return hydrated;
  }

  public async getSessionAssets(sessionId: string): Promise<Array<{type: "avatar" | "sticker"; filename: string; publicUrl: string}>> {
    void sessionId;
    return [];
  }

  public async getStickerManifest(sessionId: string): Promise<StickerAssetManifest> {
    const state = await this.getSessionState(sessionId);
    return {
      sessionId,
      revision: state.revision,
      stickers: [
        ...state.gameState.stickerCatalog.map(sticker => ({
          id: sticker.id,
          imageUrl: sticker.imageUrl,
          kind: sticker.ownerPlayerId ? "player" as const : "default" as const,
          ownerPlayerId: sticker.ownerPlayerId,
          createdAt: sticker.createdAt,
        })),
      ],
    };
  }

  public async exportSessionBackup(sessionId: string): Promise<Blob> {
    const state = await this.loadPersistedSessionState(sessionId);
    const assets = await this.collectBackupAssets(state);
    const backup: LocalGameBackup = {
      format: LOCAL_GAME_BACKUP_FORMAT,
      version: 2,
      exportedAt: Date.now(),
      state,
      assets,
    };
    return new Blob([JSON.stringify(backup, null, 2)], {type: "application/json"});
  }

  public async importSessionBackup(file: File): Promise<SessionSummary> {
    const backup = JSON.parse(await file.text()) as Partial<LocalGameBackup>;
    if (backup.format !== LOCAL_GAME_BACKUP_FORMAT || (backup.version !== 1 && backup.version !== 2) || !this.isSessionStateLike(backup.state)) {
      throw new Error("Invalid Stickermania local session backup.");
    }

    backup.state.sessionId = LOCAL_GAME_ID;
    backup.state.sessionCode = LOCAL_GAME_CODE;

    const existing = await this.db.getSession(LOCAL_GAME_ID);
    if (existing) {
      await this.deleteStateAssets(existing);
    }

    if (Array.isArray(backup.assets)) {
      for (const asset of backup.assets) {
        if (typeof asset.assetId === "string" && typeof asset.dataUrl === "string") {
          await this.saveDataUrlAsset(asset.assetId, asset.dataUrl);
        }
      }
    }

    await this.savePersistedSessionState(backup.state);
    return {
      sessionId: backup.state.sessionId,
      sessionCode: backup.state.sessionCode,
      playerCount: Object.keys(backup.state.players).length,
      createdAt: backup.state.createdAt,
      expiresAt: backup.state.expiresAt,
    };
  }

  private async hydrateSessionState(state: SessionState): Promise<SessionState> {
    const hydrated = this.clone(state);
    for (const player of Object.values(hydrated.players)) {
      await this.hydratePlayer(player);
    }
    for (const sticker of Object.values(hydrated.gameState.playerStickers).flat()) {
      await this.hydrateStickerLike(sticker);
    }
    for (const sticker of hydrated.gameState.stickerCatalog) {
      await this.hydrateStickerLike(sticker);
    }
    return hydrated;
  }

  private async hydratePlayer(player: SessionPlayer): Promise<void> {
    if (player.avatarUrl) {
      player.avatarUrl = await this.resolveAssetUrl(player.avatarUrl);
    }
  }

  private async hydrateStickerLike(sticker: PlayerSticker | StickerDefinition): Promise<void> {
    sticker.imageUrl = await this.resolveAssetUrl(sticker.imageUrl);
    if (sticker.editorData) {
      sticker.editorData.baseImageUrl = await this.resolveAssetUrl(sticker.editorData.baseImageUrl);
      sticker.editorData.paintImageUrl = await this.resolveAssetUrl(sticker.editorData.paintImageUrl);
    }
  }

  private async migrateInlineDataUrlsToAssets(state: SessionState): Promise<boolean> {
    let changed = false;

    for (const [playerId, player] of Object.entries(state.players)) {
      if (this.isDataUrl(player.avatarUrl)) {
        player.avatarUrl = await this.saveDataUrlAsset(`avatar:${playerId}`, player.avatarUrl);
        player.avatarAssetPath = player.avatarUrl;
        changed = true;
      }
    }

    for (const stickers of Object.values(state.gameState.playerStickers)) {
      for (const sticker of stickers) {
        changed = await this.migrateStickerDataUrls(sticker, `sticker:${sticker.id}`) || changed;
      }
    }

    for (const sticker of state.gameState.stickerCatalog) {
      changed = await this.migrateStickerDataUrls(sticker, `sticker:${sticker.id}`) || changed;
    }

    return changed;
  }

  private async migrateStickerDataUrls(sticker: PlayerSticker | StickerDefinition, assetPrefix: string): Promise<boolean> {
    let changed = false;
    if (this.isDataUrl(sticker.imageUrl)) {
      sticker.imageUrl = await this.saveDataUrlAsset(`${assetPrefix}:image`, sticker.imageUrl);
      if ("assetPath" in sticker) {
        sticker.assetPath = sticker.imageUrl;
      }
      changed = true;
    }
    if (sticker.editorData) {
      if (this.isDataUrl(sticker.editorData.baseImageUrl)) {
        sticker.editorData.baseImageUrl = await this.saveDataUrlAsset(`${assetPrefix}:base`, sticker.editorData.baseImageUrl);
        sticker.editorData.baseImageAssetPath = sticker.editorData.baseImageUrl;
        changed = true;
      }
      if (this.isDataUrl(sticker.editorData.paintImageUrl)) {
        sticker.editorData.paintImageUrl = await this.saveDataUrlAsset(`${assetPrefix}:paint`, sticker.editorData.paintImageUrl);
        sticker.editorData.paintImageAssetPath = sticker.editorData.paintImageUrl;
        changed = true;
      }
    }
    return changed;
  }

  private async collectBackupAssets(state: SessionState): Promise<LocalGameBackupAsset[]> {
    const assetIds = this.collectStateAssetIds(state);
    const assets: LocalGameBackupAsset[] = [];
    for (const assetId of [...assetIds].sort()) {
      const record = await this.db.getAsset(assetId);
      if (record) {
        assets.push({assetId, dataUrl: await this.blobToDataUrl(record.blob)});
      }
    }
    return assets;
  }

  private async deleteStateAssets(state: SessionState): Promise<void> {
    for (const assetId of this.collectStateAssetIds(state)) {
      this.revokeObjectUrl(assetId);
      await this.db.deleteAsset(assetId);
    }
  }

  private collectStateAssetIds(state: SessionState): Set<string> {
    const assetIds = new Set<string>();
    for (const player of Object.values(state.players)) {
      this.addAssetId(assetIds, player.avatarUrl);
    }
    for (const sticker of Object.values(state.gameState.playerStickers).flat()) {
      this.collectStickerAssetIds(assetIds, sticker);
    }
    for (const sticker of state.gameState.stickerCatalog) {
      this.collectStickerAssetIds(assetIds, sticker);
    }
    return assetIds;
  }

  private collectStickerAssetIds(assetIds: Set<string>, sticker: PlayerSticker | StickerDefinition): void {
    this.addAssetId(assetIds, sticker.imageUrl);
    if (sticker.editorData) {
      this.addAssetId(assetIds, sticker.editorData.baseImageUrl);
      this.addAssetId(assetIds, sticker.editorData.paintImageUrl);
    }
  }

  private addAssetId(assetIds: Set<string>, value: string | null | undefined): void {
    const assetId = this.assetIdFromRef(value);
    if (assetId) assetIds.add(assetId);
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const [metadata, encoded] = dataUrl.split(",", 2);
    if (!metadata || typeof encoded !== "string") {
      throw new Error("Invalid data URL.");
    }
    const mime = metadata.match(/^data:([^;]+);base64$/)?.[1] ?? "application/octet-stream";
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], {type: mime});
  }

  private async optimizeDataUrlForStorage(dataUrl: string): Promise<string> {
    const mime = this.mimeTypeFromDataUrl(dataUrl);
    if (!mime?.startsWith("image/") || mime === "image/svg+xml" || mime === "image/gif") {
      return dataUrl;
    }

    try {
      const image = await this.loadImage(dataUrl);
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        return dataUrl;
      }

      const longSide = Math.max(sourceWidth, sourceHeight);
      const scale = Math.min(1, LOCAL_ASSET_MAX_SIDE / longSide);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return dataUrl;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const hasTransparency = this.canvasHasTransparency(ctx, canvas.width, canvas.height);
      const optimized = hasTransparency
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", LOCAL_ASSET_JPEG_QUALITY);
      return optimized.length < dataUrl.length ? optimized : dataUrl;
    } catch {
      return dataUrl;
    }
  }

  private mimeTypeFromDataUrl(dataUrl: string): string | null {
    return dataUrl.match(/^data:([^;,]+)[;,]/)?.[1]?.toLowerCase() ?? null;
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load local asset image."));
      image.src = dataUrl;
    });
  }

  private canvasHasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
    const pixels = ctx.getImageData(0, 0, width, height).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] < 255) {
        return true;
      }
    }
    return false;
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private isDataUrl(value: string | null | undefined): value is string {
    return typeof value === "string" && value.startsWith("data:");
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private revokeObjectUrl(assetId: string): void {
    const url = this.objectUrls.get(assetId);
    if (!url) return;
    URL.revokeObjectURL(url);
    this.objectUrls.delete(assetId);
  }

  public loadLastSessionId(): string | null {
    return localStorage.getItem(LAST_LOCAL_SESSION_ID_KEY) || null;
  }

  private saveLastSessionId(sessionId: string): void {
    localStorage.setItem(LAST_LOCAL_SESSION_ID_KEY, sessionId);
  }

  private toResolvedSessionInfo(state: SessionState): ResolvedSessionInfo {
    return {
      sessionId: state.sessionId,
      sessionCode: state.sessionCode,
      createdAt: state.createdAt,
      expiresAt: state.expiresAt,
    };
  }

  private toSessionInfo(state: SessionState): SessionInfo {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return {
      sessionId: state.sessionId,
      sessionCode: state.sessionCode,
      playerJoinUrl: `${baseUrl}?view=player`,
      boardUrl: `${baseUrl}?view=board`,
      createdAt: state.createdAt,
      expiresAt: state.expiresAt,
    };
  }

  private isSessionStateLike(value: unknown): value is SessionState {
    if (!value || typeof value !== "object") {
      return false;
    }
    const state = value as Partial<SessionState>;
    return typeof state.sessionId === "string"
      && typeof state.sessionCode === "string"
      && typeof state.createdAt === "number"
      && typeof state.expiresAt === "number"
      && typeof state.revision === "number"
      && !!state.players
      && !!state.gameState
      && Array.isArray(state.gameState.stickerCatalog)
      && Array.isArray(state.gameState.stickerPacks)
      && Array.isArray(state.gameState.boardPlacements);
  }
}
