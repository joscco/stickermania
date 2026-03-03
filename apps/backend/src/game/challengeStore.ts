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
    // Migrate older persisted states
    if (!this.state.promptAssignments) {
      this.state.promptAssignments = {};
    }
    this.promptPool = GameStore.shuffle([...this.config.drawPrompts]);
  }

  public static createEmpty(config: GameConfig): GameState {
    return {
      players: {}, drawings: {},
      round: GameStore.defaultRound(config),
      promptAssignments: {},
      effectiveFieldWidth: 1000,
      effectiveFieldHeight: 1000,
      revision: 0, updatedAt: Date.now()
    };
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
    // Batch-assign draw prompts for all active players
    this.batchAssignDrawPrompts();
    this.bumpRevision();
    this.phaseTimer = setTimeout(() => { this.startSearchPhase(); this.onPhaseChange?.(); }, this.state.round.drawDurationSec * 1000);
  }

  public startSearchPhase(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "SEARCH";
    this.state.round.endsAt = Date.now() + this.state.round.searchDurationSec * 1000;
    // Batch-assign search tasks for all active players
    this.batchAssignSearchTasks();
    this.bumpRevision();
    this.phaseTimer = setTimeout(() => { this.endRound(); this.onPhaseChange?.(); }, this.state.round.searchDurationSec * 1000);
  }

  private endRound(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "PAUSED";
    this.state.round.endsAt = 0;
    // Clear prompt assignments for the ended round
    this.state.promptAssignments = {};
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

  /**
   * Place drawings in a circular cluster centered on the field.
   * Uses Poisson-disk-like sampling within a circular area that grows with the number of drawings.
   */
  private poissonPlaceDrawing(size: number): { x: number; y: number } {
    const existing = Object.values(this.state.drawings);
    const margin = size / 2 + 0.03;

    if (existing.length === 0) {
      // First drawing goes near center with a bit of randomness
      return {
        x: 0.5 + (Math.random() - 0.5) * 0.1,
        y: 0.5 + (Math.random() - 0.5) * 0.1
      };
    }

    // Circular radius grows with drawing count, capped so we stay within bounds
    const maxRadius = 0.5 - margin;
    const baseRadius = 0.12;
    const radiusGrowth = 0.025; // per existing drawing
    const circleRadius = Math.min(maxRadius, baseRadius + existing.length * radiusGrowth);

    let bestCandidate = { x: 0.5, y: 0.5 };
    let bestMinDist = -1;

    for (let i = 0; i < 40; i++) {
      // Generate random point within circle centered at (0.5, 0.5)
      const angle = Math.random() * 2 * Math.PI;
      const r = circleRadius * Math.sqrt(Math.random()); // sqrt for uniform distribution within circle
      const cx = 0.5 + r * Math.cos(angle);
      const cy = 0.5 + r * Math.sin(angle);

      // Clamp to valid range
      if (cx < margin || cx > 1 - margin || cy < margin || cy > 1 - margin) continue;

      let minDist = Infinity;
      for (const d of existing) {
        const dist = Math.sqrt((cx - d.x) ** 2 + (cy - d.y) ** 2);
        if (dist < minDist) minDist = dist;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestCandidate = { x: cx, y: cy };
      }
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

  /**
   * Batch-assign draw prompts for all active player sessions at round start.
   * Stored in state.promptAssignments so they persist across reconnects.
   */
  private batchAssignDrawPrompts(): void {
    this.state.promptAssignments = {};
    for (const session of this.sessions.values()) {
      if (session.kind !== "player") continue;
      const player = this.state.players[session.playerId];
      if (!player || !player.name || !player.avatarDataUrl) continue;

      const maxDraw = this.config.maxDrawingsPerRound > 0 ? this.config.maxDrawingsPerRound : 3;
      const prompts: string[] = [];
      for (let i = 0; i < maxDraw; i++) {
        const prompt = this.pickDrawPrompt(session.usedDrawPrompts);
        session.usedDrawPrompts.add(prompt);
        prompts.push(prompt);
      }

      this.state.promptAssignments[session.playerId] = {
        drawPrompts: prompts,
        drawPromptIndex: 0,
        activeDrawPrompt: null,
        searchTasks: [],
        searchTaskIndex: 0,
        activeSearchDrawingId: null
      };
    }
  }

  /**
   * Batch-assign search tasks for all active player sessions at search phase start.
   */
  private batchAssignSearchTasks(): void {
    for (const session of this.sessions.values()) {
      if (session.kind !== "player") continue;
      const player = this.state.players[session.playerId];
      if (!player || !player.name || !player.avatarDataUrl) continue;

      const assignment = this.state.promptAssignments[session.playerId];
      if (!assignment) continue;

      // Find all unfound drawings not by this player
      const unfound = this.getUnfoundDrawingsForPlayer(session.playerId, session.usedSearchIds);
      const shuffled = GameStore.shuffle([...unfound]);

      assignment.searchTasks = shuffled.map(d => {
        const artist = this.state.players[d.artistId];
        return { drawingId: d.id, prompt: d.prompt, artistName: artist?.name || "Unbekannt" };
      });
      assignment.searchTaskIndex = 0;
      assignment.activeSearchDrawingId = null;
    }
  }

  public assignDrawTask(clientId: string): PlayerTask | null {
    const session = this.sessions.get(clientId);
    if (!session) return null;

    const assignment = this.state.promptAssignments[session.playerId];
    if (!assignment) return null;

    // Check if there are remaining draw prompts
    if (assignment.drawPromptIndex >= assignment.drawPrompts.length) {
      return null;
    }

    const drawIndex = assignment.drawPromptIndex;
    const prompt = assignment.drawPrompts[drawIndex];
    assignment.drawPromptIndex++;
    assignment.activeDrawPrompt = prompt;

    session.currentDrawPrompt = prompt;
    session.currentSearchDrawingId = null;
    session.lastTaskMode = "DRAW";
    session.drawCountThisRound++;
    return { mode: "DRAW", prompt, drawIndex, drawTotal: assignment.drawPrompts.length };
  }

  public assignSearchTask(clientId: string): PlayerTask | null {
    const session = this.sessions.get(clientId);
    if (!session) return null;

    const assignment = this.state.promptAssignments[session.playerId];
    if (!assignment) return null;

    // Skip over tasks for drawings that have already been found
    while (assignment.searchTaskIndex < assignment.searchTasks.length) {
      const task = assignment.searchTasks[assignment.searchTaskIndex];
      const drawing = this.state.drawings[task.drawingId];
      if (drawing && !drawing.foundBy) {
        break; // This one is still valid
      }
      assignment.searchTaskIndex++; // Skip found drawings
    }

    if (assignment.searchTaskIndex >= assignment.searchTasks.length) {
      return null;
    }

    const task = assignment.searchTasks[assignment.searchTaskIndex];
    assignment.searchTaskIndex++;
    assignment.activeSearchDrawingId = task.drawingId;

    session.currentSearchDrawingId = task.drawingId;
    session.currentDrawPrompt = null;
    session.usedSearchIds.add(task.drawingId);
    session.lastTaskMode = "SEARCH";
    return { mode: "SEARCH", prompt: task.prompt, drawingId: task.drawingId, artistName: task.artistName };
  }

  /**
   * Get the current draw task for a reconnecting player without advancing the index.
   * Uses the persisted `activeDrawPrompt` — if null, the player has no active task.
   * Also updates the session state so the submit-drawing handler works.
   */
  public getCurrentDrawTaskForPlayer(playerId: string): PlayerTask | null {
    const assignment = this.state.promptAssignments[playerId];
    if (!assignment) return null;
    if (!assignment.activeDrawPrompt) return null; // No active task (was submitted or never assigned)

    const prompt = assignment.activeDrawPrompt;
    const drawIndex = assignment.drawPromptIndex - 1; // The active prompt was the last one assigned

    // Update session state so submit-drawing handler finds the active prompt
    for (const session of this.sessions.values()) {
      if (session.playerId === playerId) {
        session.currentDrawPrompt = prompt;
        session.currentSearchDrawingId = null;
        break;
      }
    }
    return { mode: "DRAW", prompt, drawIndex: Math.max(0, drawIndex), drawTotal: assignment.drawPrompts.length };
  }

  /**
   * Get the current search task for a reconnecting player without advancing the index.
   * Uses the persisted `activeSearchDrawingId` — if null, the player has no active task.
   * Also updates the session state so the search-snapshot handler works.
   */
  public getCurrentSearchTaskForPlayer(playerId: string): PlayerTask | null {
    const assignment = this.state.promptAssignments[playerId];
    if (!assignment) return null;
    if (!assignment.activeSearchDrawingId) return null; // No active task

    const drawingId = assignment.activeSearchDrawingId;
    const drawing = this.state.drawings[drawingId];
    if (!drawing || drawing.foundBy) {
      // The drawing was already found — clear the active task
      assignment.activeSearchDrawingId = null;
      return null;
    }

    const artist = this.state.players[drawing.artistId];
    // Update session state so search-snapshot handler finds the active drawingId
    for (const session of this.sessions.values()) {
      if (session.playerId === playerId) {
        session.currentSearchDrawingId = drawingId;
        session.currentDrawPrompt = null;
        break;
      }
    }
    return { mode: "SEARCH", prompt: drawing.prompt, drawingId, artistName: artist?.name || "Unbekannt" };
  }

  private getUnfoundDrawingsForPlayer(playerId: string, usedSearchIds: Set<string>): Drawing[] {
    return Object.values(this.state.drawings).filter(d =>
      d.foundBy === null && d.artistId !== playerId && !usedSearchIds.has(d.id)
    );
  }

  /** Clear the active draw prompt after submission — persisted so reconnects know there's no active task */
  public clearActiveDrawPrompt(playerId: string): void {
    const assignment = this.state.promptAssignments[playerId];
    if (assignment) assignment.activeDrawPrompt = null;
  }

  /** Clear the active search task after a correct snapshot — persisted so reconnects know there's no active task */
  public clearActiveSearchTask(playerId: string): void {
    const assignment = this.state.promptAssignments[playerId];
    if (assignment) assignment.activeSearchDrawingId = null;
  }

  /** Get the persisted active draw prompt for a player (source of truth) */
  public getActiveDrawPrompt(playerId: string): string | null {
    return this.state.promptAssignments[playerId]?.activeDrawPrompt ?? null;
  }

  /** Get the persisted active search drawing ID for a player (source of truth) */
  public getActiveSearchDrawingId(playerId: string): string | null {
    return this.state.promptAssignments[playerId]?.activeSearchDrawingId ?? null;
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

