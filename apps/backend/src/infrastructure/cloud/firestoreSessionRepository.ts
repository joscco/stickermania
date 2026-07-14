import {Firestore} from "@google-cloud/firestore";
import type {SessionState} from "@stickermania/shared";
import type {SessionRepository} from "../sessionRepository.js";

export class FirestoreSessionRepository implements SessionRepository {
  private readonly firestore: Firestore;

  public constructor(args: {projectId?: string | null; collectionName: string}) {
    this.firestore = new Firestore({
      ...(args.projectId ? {projectId: args.projectId} : {}),
      ignoreUndefinedProperties: true,
    });
    this.collectionName = args.collectionName;
  }

  private readonly collectionName: string;

  public async create(sessionState: SessionState): Promise<void> {
    await this.save(sessionState);
  }

  public async load(sessionId: string): Promise<SessionState | null> {
    const doc = await this.collection().doc(sessionId).get();
    if (!doc.exists) return null;
    return doc.data() as SessionState;
  }

  public async loadByCode(sessionCode: string): Promise<SessionState | null> {
    const snapshot = await this.collection()
      .where("sessionCode", "==", sessionCode)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as SessionState;
  }

  public async save(sessionState: SessionState): Promise<void> {
    await this.collection().doc(sessionState.sessionId).set(removeUndefinedFields(sessionState));
  }

  public async delete(sessionId: string): Promise<void> {
    await this.collection().doc(sessionId).delete();
  }

  public async listAll(): Promise<SessionState[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map(doc => doc.data() as SessionState);
  }

  public async listExpired(now: number): Promise<SessionState[]> {
    const snapshot = await this.collection()
      .where("expiresAt", "<=", now)
      .get();
    return snapshot.docs.map(doc => doc.data() as SessionState);
  }

  private collection() {
    return this.firestore.collection(this.collectionName);
  }
}

function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => item === undefined ? null : removeUndefinedFields(item)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    sanitized[key] = removeUndefinedFields(child);
  }
  return sanitized as T;
}
