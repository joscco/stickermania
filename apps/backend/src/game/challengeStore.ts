import crypto from "node:crypto";
import { DRAW_PROMPTS, type GameState, type Player, type Drawing, type PlayerTask } from "@birthday/shared";
import type { PlayerSession } from "./gameTypes.js";

export class GameStore {
  private state: GameState;
  private sessions: Map<string, PlayerSession> = new Map(); // clientId -> session
  private promptPool: string[];

  public constructor(args?: { initial?: GameState }) {
    this.state = args?.initial ?? GameStore.createEmpty();
    this.promptPool = GameStore.shuffle([...DRAW_PROMPTS]);
  }

  public static createEmpty(): GameState {
    return { players: {}, drawings: {}, revision: 0, updatedAt: Date.now() };
  }

  // ──────── State access ────────

  public getState(): GameState {
    return this.state;
  }

  public getSession(clientId: string): PlayerSession | undefined {
    return this.sessions.get(clientId);
  }

  // ──────── Player management ────────

  public joinPlayer(args: { clientId: string; kind: "player" | "board"; existingPlayerId?: string }): Player {
    // Reuse existing player if reconnecting
    let playerId = args.existingPlayerId ?? "";
    let player = playerId ? this.state.players[playerId] : undefined;

    if (!player) {
      playerId = crypto.randomUUID();
      player = {
        id: playerId,
        name: "",
        avatarDataUrl: null,
        score: 0,
        joinedAt: Date.now()
      };
      this.state.players[playerId] = player;
      this.bumpRevision();
    }

    // Register session
    this.sessions.set(args.clientId, {
      playerId,
      clientId: args.clientId,
      kind: args.kind,
      currentDrawPrompt: null,
      currentSearchDrawingId: null,
      usedDrawPrompts: new Set(),
      usedSearchIds: new Set(),
      lastTaskMode: null
    });

    return player;
  }

  public setPlayerName(playerId: string, name: string): void {
    const player = this.state.players[playerId];
    if (!player) return;
    player.name = name.trim().slice(0, 24);
    this.bumpRevision();
  }

  public setPlayerAvatar(playerId: string, avatarDataUrl: string): void {
    const player = this.state.players[playerId];
    if (!player) return;
    player.avatarDataUrl = avatarDataUrl;
    this.bumpRevision();
  }

  public removeSession(clientId: string): void {
    this.sessions.delete(clientId);
  }

  public getLeaderboard(): Player[] {
    return Object.values(this.state.players)
      .filter(p => p.name.length > 0)
      .sort((a, b) => b.score - a.score);
  }

  // ──────── Drawing management ────────

  public addDrawing(args: { playerId: string; imageDataUrl: string; prompt: string }): Drawing {
    const id = crypto.randomUUID();

    // Place at a random position with some margin
    const drawingSize = 0.08 + Math.random() * 0.04; // 8-12% of field
    const x = 0.05 + Math.random() * 0.85;
    const y = 0.05 + Math.random() * 0.85;

    const drawing: Drawing = {
      id,
      artistId: args.playerId,
      prompt: args.prompt,
      imageDataUrl: args.imageDataUrl,
      x,
      y,
      width: drawingSize,
      height: drawingSize,
      placedAt: Date.now(),
      foundBy: null,
      foundAt: null
    };

    this.state.drawings[id] = drawing;
    this.bumpRevision();
    return drawing;
  }

  public checkSearchTap(args: { playerId: string; tappedDrawingId: string; expectedDrawingId: string }): {
    correct: boolean;
    drawing: Drawing | null;
    artist: Player | null;
  } {
    const drawing = this.state.drawings[args.tappedDrawingId];
    if (!drawing) {
      return { correct: false, drawing: null, artist: null };
    }

    const correct = args.tappedDrawingId === args.expectedDrawingId;

    if (correct && !drawing.foundBy) {
      // Mark as found
      drawing.foundBy = args.playerId;
      drawing.foundAt = Date.now();

      // Award points
      const searcher = this.state.players[args.playerId];
      const artist = this.state.players[drawing.artistId];

      if (searcher) searcher.score += 1;
      if (artist && artist.id !== args.playerId) artist.score += 1;

      this.bumpRevision();
      return { correct: true, drawing, artist: artist ?? null };
    }

    return { correct, drawing, artist: null };
  }

  // ──────── Task assignment ────────

  public assignTask(clientId: string): PlayerTask | null {
    const session = this.sessions.get(clientId);
    if (!session) return null;

    const playerId = session.playerId;

    // Alternate between DRAW and SEARCH, preferring DRAW if no drawings exist
    const unfoundDrawings = this.getUnfoundDrawingsForPlayer(playerId, session.usedSearchIds);

    let preferSearch = session.lastTaskMode === "DRAW" || session.lastTaskMode === null;

    // Can't search if there's nothing to find
    if (unfoundDrawings.length === 0) {
      preferSearch = false;
    }

    if (preferSearch) {
      // Assign a search task
      const drawing = unfoundDrawings[Math.floor(Math.random() * unfoundDrawings.length)];
      const artist = this.state.players[drawing.artistId];

      session.currentSearchDrawingId = drawing.id;
      session.currentDrawPrompt = null;
      session.usedSearchIds.add(drawing.id);
      session.lastTaskMode = "SEARCH";

      return {
        mode: "SEARCH",
        prompt: drawing.prompt,
        drawingId: drawing.id,
        artistName: artist?.name || "Unbekannt"
      };
    }

    // Assign a draw task
    const prompt = this.pickDrawPrompt(session.usedDrawPrompts);
    session.currentDrawPrompt = prompt;
    session.currentSearchDrawingId = null;
    session.usedDrawPrompts.add(prompt);
    session.lastTaskMode = "DRAW";

    return {
      mode: "DRAW",
      prompt
    };
  }

  private getUnfoundDrawingsForPlayer(playerId: string, usedSearchIds: Set<string>): Drawing[] {
    return Object.values(this.state.drawings).filter(d =>
      d.foundBy === null &&
      d.artistId !== playerId &&
      !usedSearchIds.has(d.id)
    );
  }

  private pickDrawPrompt(usedPrompts: Set<string>): string {
    // Try to find unused prompt from pool
    for (let i = this.promptPool.length - 1; i >= 0; i--) {
      if (!usedPrompts.has(this.promptPool[i])) {
        return this.promptPool.splice(i, 1)[0];
      }
    }

    // Refill pool if needed
    this.promptPool = GameStore.shuffle([...DRAW_PROMPTS]);

    for (let i = this.promptPool.length - 1; i >= 0; i--) {
      if (!usedPrompts.has(this.promptPool[i])) {
        return this.promptPool.splice(i, 1)[0];
      }
    }

    // Fallback: just pick random from pool
    return this.promptPool.pop() ?? DRAW_PROMPTS[0];
  }

  // ──────── Reset ────────

  public reset(): void {
    this.state = GameStore.createEmpty();
    this.sessions.clear();
    this.promptPool = GameStore.shuffle([...DRAW_PROMPTS]);
  }

  // ──────── Internal ────────

  private bumpRevision(): void {
    this.state.revision++;
    this.state.updatedAt = Date.now();
  }

  private static shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}