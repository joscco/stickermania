import {Injectable} from "@angular/core";
import type {SessionState} from "@stickermania/shared";

const DB_NAME = "stickermania-local-web";
const DB_VERSION = 2;
const SESSION_STORE = "sessions";
const ASSET_STORE = "assets";

export interface LocalAssetRecord {
  assetId: string;
  blob: Blob;
  updatedAt: number;
}

@Injectable({providedIn: "root"})
export class LocalSessionDb {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public async listSessions(): Promise<SessionState[]> {
    const store = await this.readStore();
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result as SessionState[]).sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  }

  public async getSession(sessionId: string): Promise<SessionState | null> {
    const store = await this.readStore();
    return new Promise((resolve, reject) => {
      const request = store.get(sessionId);
      request.onsuccess = () => resolve((request.result as SessionState | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  public async getSessionByCode(sessionCode: string): Promise<SessionState | null> {
    const sessions = await this.listSessions();
    return sessions.find(session => session.sessionCode === sessionCode) ?? null;
  }

  public async saveSession(session: SessionState): Promise<void> {
    const store = await this.writeStore();
    return new Promise((resolve, reject) => {
      const request = store.put(session);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async saveAsset(assetId: string, blob: Blob): Promise<void> {
    const store = await this.writeAssetStore();
    return new Promise((resolve, reject) => {
      const record: LocalAssetRecord = {assetId, blob, updatedAt: Date.now()};
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async getAsset(assetId: string): Promise<LocalAssetRecord | null> {
    const store = await this.readAssetStore();
    return new Promise((resolve, reject) => {
      const request = store.get(assetId);
      request.onsuccess = () => resolve((request.result as LocalAssetRecord | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  public async deleteAsset(assetId: string): Promise<void> {
    const store = await this.writeAssetStore();
    return new Promise((resolve, reject) => {
      const request = store.delete(assetId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const store = await this.writeStore();
    return new Promise((resolve, reject) => {
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async readStore(): Promise<IDBObjectStore> {
    const db = await this.openDb();
    return db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE);
  }

  private async writeStore(): Promise<IDBObjectStore> {
    const db = await this.openDb();
    return db.transaction(SESSION_STORE, "readwrite").objectStore(SESSION_STORE);
  }

  private async readAssetStore(): Promise<IDBObjectStore> {
    const db = await this.openDb();
    return db.transaction(ASSET_STORE, "readonly").objectStore(ASSET_STORE);
  }

  private async writeAssetStore(): Promise<IDBObjectStore> {
    const db = await this.openDb();
    return db.transaction(ASSET_STORE, "readwrite").objectStore(ASSET_STORE);
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is not available."));
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, {keyPath: "sessionId"});
        }
        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE, {keyPath: "assetId"});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }
}
