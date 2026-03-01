import crypto from "node:crypto";
import { type GameConfig, type GameState, type Player, type Drawing, type PlayerTask, type RoundState } from "@birthday/shared";
import type { PlayerSession } from "./gameTypes.js";

export class GameStore {
  private state: GameState;
  private sessions: Map<string, PlayerSession> = new Map();
  private promptPool: string[];
  private playerColors: Map<string, string[]> = new Map();
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private onPhaseChange: (() => void) | null = null;
  private readonly config: GameConfig;

  public constructor(args: { config: GameConfig; initial?: GameState }) {
    this.config = args.config;
    this.state = args.initial ?? GameStore.createEmpty(this.config);
    if (!this.state.round) {
      (this.state as any).round = GameStore.defaultRound(this.config);
    }
    this.promptPool = GameStore.shuffle([...this.config.drawPrompts]);
  }

  public static createEmpty(config: GameConfig): GameState {
    return { players: {}, drawings: {}, round: GameStore.defaultRound(config), revision: 0, updatedAt: Date.now() };
  }

  private static defaultRound(config: GameConfig): RoundState {
    return { phase: "LOBBY", endsAt: 0, drawDurationSec: config.drawDurationSec, searchDurationSec: config.searchDurationSec, roundNumber: 0 };
  }

  public setOnPhaseChange(cb: () => void): void { this.onPhaseChange = cb; }

  // ──────── State access ────────

  public getState(): GameState { return this.state; }
  public getRound(): RoundState { return this.state.round; }
  public getConfig(): GameConfig { return this.config; }

  public getSession(clientId: string): PlayerSession | undefined { return this.sessions.get(clientId); }
  public getAllSessions(): PlayerSession[] { return Array.from(this.sessions.values()); }

  public getPlayerColors(playerId: string): string[] {
    let colors = this.playerColors.get(playerId);
    if (!colors) {
      const shuffled = GameStore.shuffle([...this.config.playerColors]);
      colors = shuffled.slice(0, this.config.colorsPerPlayer);
      this.playerColors.set(playerId, colors);
    }
    return colors;
  }

  // ──────── Player management ────────

  public joinPlayer(args: { clientId: string; kind: "player" | "board"; existingPlayerId?: string }): Player {
    let playerId = args.existingPlayerId ?? "";
    let player = playerId ? this.state.players[playerId] : undefined;

    if (!player) {
      playerId = crypto.randomUUID();
      player = { id: playerId, name: "", avatarDataUrl: null, score: 0, joinedAt: Date.now() };
      this.state.players[playerId] = player;
      this.bumpRevision();
    }

    this.sessions.set(args.clientId, {
      playerId, clientId: args.clientId, kind: args.kind,
      currentDrawPrompt: null, currentSearchDrawingId: null,
      usedDrawPrompts: new Set(), usedSearchIds: new Set(), lastTaskMode: null,
      drawCountThisRound: 0
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

  public removeSession(clientId: string): void { this.sessions.delete(clientId); }

  public getLeaderboard(): Player[] {
    return Object.values(this.state.players).filter(p => p.name.length > 0).sort((a, b) => b.score - a.score);
  }

  // ──────── Round management ────────

  public setTimerConfig(drawSec: number, searchSec: number): void {
    this.state.round.drawDurationSec = Math.max(10, Math.min(600, drawSec));
    this.state.round.searchDurationSec = Math.max(10, Math.min(600, searchSec));
    this.bumpRevision();
  }

  public startDrawPhase(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "DRAW";
    this.state.round.roundNumber++;
    this.state.round.endsAt = Date.now() + this.state.round.drawDurationSec * 1000;
    // Reset per-player draw count for this round
    for (const session of this.sessions.values()) {
      session.drawCountThisRound = 0;
    }
    this.bumpRevision();
    this.phaseTimer = setTimeout(() => { this.startSearchPhase(); this.onPhaseChange?.(); }, this.state.round.drawDurationSec * 1000);
  }

  public startSearchPhase(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "SEARCH";
    this.state.round.endsAt = Date.now() + this.state.round.searchDurationSec * 1000;
    this.bumpRevision();
    this.phaseTimer = setTimeout(() => { this.endRound(); this.onPhaseChange?.(); }, this.state.round.searchDurationSec * 1000);
  }

  private endRound(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "PAUSED";
    this.state.round.endsAt = 0;
    this.bumpRevision();
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) { clearTimeout(this.phaseTimer); this.phaseTimer = null; }
  }

  // ──────── Drawing management ────────

  public addDrawing(args: { playerId: string; imageDataUrl: string; prompt: string }): Drawing {
    const id = crypto.randomUUID();
    const size = this.config.drawingSize;
    const pos = this.poissonPlaceDrawing(size);

    const drawing: Drawing = {
      id, artistId: args.playerId, prompt: args.prompt, imageDataUrl: args.imageDataUrl,
      x: pos.x, y: pos.y, size, placedAt: Date.now(), foundBy: null, foundAt: null
    };

    this.state.drawings[id] = drawing;
    this.bumpRevision();
    return drawing;
  }

  private poissonPlaceDrawing(size: number): { x: number; y: number } {
    const existing = Object.values(this.state.drawings);
    const margin = size / 2 + 0.03;
    const minX = margin, maxX = 1 - margin, minY = margin, maxY = 1 - margin;
    if (existing.length === 0) {
      return { x: minX + Math.random() * (maxX - minX), y: minY + Math.random() * (maxY - minY) };
    }
    let bestCandidate = { x: 0.5, y: 0.5 };
    let bestMinDist = -1;
    for (let i = 0; i < 30; i++) {
      const cx = minX + Math.random() * (maxX - minX);
      const cy = minY + Math.random() * (maxY - minY);
      let minDist = Infinity;
      for (const d of existing) {
        const dist = Math.sqrt((cx - d.x) ** 2 + (cy - d.y) ** 2);
        if (dist < minDist) minDist = dist;
      }
      if (minDist > bestMinDist) { bestMinDist = minDist; bestCandidate = { x: cx, y: cy }; }
    }
    return bestCandidate;
  }

  public checkSearchSnapshot(args: {
    playerId: string; centerX: number; centerY: number; radius: number; expectedDrawingId: string;
  }): { correct: boolean; drawing: Drawing | null; artist: Player | null } {
    const drawing = this.state.drawings[args.expectedDrawingId];
    if (!drawing) return { correct: false, drawing: null, artist: null };
    const dist = Math.sqrt((args.centerX - drawing.x) ** 2 + (args.centerY - drawing.y) ** 2);
    const correct = dist <= args.radius + drawing.size / 2;
    if (correct && !drawing.foundBy) {
      drawing.foundBy = args.playerId; drawing.foundAt = Date.now();
      const searcher = this.state.players[args.playerId];
      const artist = this.state.players[drawing.artistId];
      if (searcher) searcher.score += 1;
      if (artist && artist.id !== args.playerId) artist.score += 1;
      this.bumpRevision();
      return { correct: true, drawing, artist: artist ?? null };
    }
    return { correct: false, drawing: null, artist: null };
  }

  // ──────── Task assignment ────────

  public assignDrawTask(clientId: string): PlayerTask | null {
    const session = this.sessions.get(clientId);
    if (!session) return null;
    // Check max drawings per round limit
    if (this.config.maxDrawingsPerRound > 0 && session.drawCountThisRound >= this.config.maxDrawingsPerRound) {
      return null;
    }
    const prompt = this.pickDrawPrompt(session.usedDrawPrompts);
    session.currentDrawPrompt = prompt; session.currentSearchDrawingId = null;
    session.usedDrawPrompts.add(prompt); session.lastTaskMode = "DRAW";
    session.drawCountThisRound++;
    return { mode: "DRAW", prompt };
  }

  public assignSearchTask(clientId: string): PlayerTask | null {
    const session = this.sessions.get(clientId);
    if (!session) return null;
    const unfound = this.getUnfoundDrawingsForPlayer(session.playerId, session.usedSearchIds);
    if (unfound.length === 0) return null;
    const drawing = unfound[Math.floor(Math.random() * unfound.length)];
    const artist = this.state.players[drawing.artistId];
    session.currentSearchDrawingId = drawing.id; session.currentDrawPrompt = null;
    session.usedSearchIds.add(drawing.id); session.lastTaskMode = "SEARCH";
    return { mode: "SEARCH", prompt: drawing.prompt, drawingId: drawing.id, artistName: artist?.name || "Unbekannt" };
  }

  private getUnfoundDrawingsForPlayer(playerId: string, usedSearchIds: Set<string>): Drawing[] {
    return Object.values(this.state.drawings).filter(d =>
      d.foundBy === null && d.artistId !== playerId && !usedSearchIds.has(d.id)
    );
  }

  private pickDrawPrompt(usedPrompts: Set<string>): string {
    for (let i = this.promptPool.length - 1; i >= 0; i--) {
      if (!usedPrompts.has(this.promptPool[i])) return this.promptPool.splice(i, 1)[0];
    }
    this.promptPool = GameStore.shuffle([...this.config.drawPrompts]);
    for (let i = this.promptPool.length - 1; i >= 0; i--) {
      if (!usedPrompts.has(this.promptPool[i])) return this.promptPool.splice(i, 1)[0];
    }
    return this.promptPool.pop() ?? this.config.drawPrompts[0] ?? "?";
  }

  // ──────── Reset ────────

  public reset(): void {
    this.clearPhaseTimer();
    this.state = GameStore.createEmpty(this.config);
    this.sessions.clear();
    this.playerColors.clear();
    this.promptPool = GameStore.shuffle([...this.config.drawPrompts]);
  }

  // ──────── Internal ────────

  private bumpRevision(): void { this.state.revision++; this.state.updatedAt = Date.now(); }

  public static shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

