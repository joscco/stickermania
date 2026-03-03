import crypto from "node:crypto";
import { type GameConfig, type GameState, type Player, type Drawing, type PlayerTask, type RoundState } from "@birthday/shared";
import type { PlayerSession } from "./gameTypes.js";

export class GameStore {
  private state: GameState;
  private readonly sessions = new Map<string, PlayerSession>();
  private promptPool: string[];
  private readonly playerColors = new Map<string, string[]>();
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private onPhaseChange: (() => void) | null = null;
  private readonly config: GameConfig;

  public constructor(args: { config: GameConfig; initial?: GameState }) {
    this.config = args.config;
    this.state = args.initial ?? GameStore.createEmpty(this.config);
    if (!this.state.round) {
      (this.state as any).round = GameStore.defaultRound(this.config);
    }
    if (!this.state.promptAssignments) {
      this.state.promptAssignments = {};
    }
    this.promptPool = GameStore.shuffle([...this.config.drawPrompts]);
    // Recalculate field size based on existing drawings (e.g. after loading saved state)
    this.recalcEffectiveFieldSize();
  }

  public static createEmpty(config: GameConfig): GameState {
    return {
      players: {},
      drawings: {},
      round: GameStore.defaultRound(config),
      promptAssignments: {},
      effectiveFieldWidth: 400,
      effectiveFieldHeight: 400,
      revision: 0,
      updatedAt: Date.now(),
    };
  }

  private static defaultRound(config: GameConfig): RoundState {
    return {
      phase: "LOBBY",
      endsAt: 0,
      drawDurationSec: config.drawDurationSec,
      searchDurationSec: config.searchDurationSec,
      roundNumber: 0,
    };
  }

  public setOnPhaseChange(callback: () => void): void {
    this.onPhaseChange = callback;
  }

  // ──────── State access ────────

  public getState(): GameState { return this.state; }
  public getRound(): RoundState { return this.state.round; }
  public getConfig(): GameConfig { return this.config; }

  public getSession(clientId: string): PlayerSession | undefined {
    return this.sessions.get(clientId);
  }

  public getAllSessions(): PlayerSession[] {
    return Array.from(this.sessions.values());
  }

  public removeSession(clientId: string): void {
    this.sessions.delete(clientId);
  }

  /** Remove sessions whose clientId is not in the given set of active client IDs. */
  public purgeDisconnectedSessions(activeClientIds: Set<string>): void {
    for (const [clientId, session] of this.sessions) {
      if (!activeClientIds.has(clientId)) {
        console.log(`[purge] Removing stale session ${clientId} (player ${session.playerId})`);
        this.sessions.delete(clientId);
      }
    }
  }

  public getPlayerColors(playerId: string): string[] {
    const existing = this.playerColors.get(playerId);
    if (existing) {
      return existing;
    }
    const shuffled = GameStore.shuffle([...this.config.playerColors]);
    const assigned = shuffled.slice(0, this.config.colorsPerPlayer);
    this.playerColors.set(playerId, assigned);
    return assigned;
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
      playerId,
      clientId: args.clientId,
      kind: args.kind,
      currentDrawPrompt: null,
      currentSearchDrawingId: null,
      usedDrawPrompts: new Set(),
      usedSearchIds: new Set(),
      lastTaskMode: null,
      drawCountThisRound: 0,
    });

    return player;
  }

  public setPlayerName(playerId: string, name: string): void {
    const player = this.state.players[playerId];
    if (!player) {
      return;
    }
    player.name = name.trim().slice(0, 24);
    this.bumpRevision();
  }

  public setPlayerAvatar(playerId: string, avatarDataUrl: string): void {
    const player = this.state.players[playerId];
    if (!player) {
      return;
    }
    player.avatarDataUrl = avatarDataUrl;
    this.bumpRevision();
  }

  public getLeaderboard(): Player[] {
    return Object.values(this.state.players)
      .filter((player) => player.name.length > 0)
      .sort((a, b) => b.score - a.score);
  }

  // ──────── Round management ────────

  public setTimerConfig(drawDurationSec: number, searchDurationSec: number): void {
    this.state.round.drawDurationSec = Math.max(10, Math.min(600, drawDurationSec));
    this.state.round.searchDurationSec = Math.max(10, Math.min(600, searchDurationSec));
    this.bumpRevision();
  }

  public startDrawPhase(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "DRAW";
    this.state.round.roundNumber++;
    this.state.round.endsAt = Date.now() + this.state.round.drawDurationSec * 1000;

    for (const session of this.sessions.values()) {
      session.drawCountThisRound = 0;
    }
    this.batchAssignDrawPrompts();
    this.bumpRevision();

    this.phaseTimer = setTimeout(() => {
      this.startSearchPhase();
      this.onPhaseChange?.();
    }, this.state.round.drawDurationSec * 1000);
  }

  public startSearchPhase(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "SEARCH";
    this.state.round.endsAt = Date.now() + this.state.round.searchDurationSec * 1000;

    this.batchAssignSearchTasks();
    this.bumpRevision();

    this.phaseTimer = setTimeout(() => {
      this.endRound();
      this.onPhaseChange?.();
    }, this.state.round.searchDurationSec * 1000);
  }

  private endRound(): void {
    this.clearPhaseTimer();
    this.state.round.phase = "PAUSED";
    this.state.round.endsAt = 0;
    this.state.promptAssignments = {};
    this.bumpRevision();
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  // ──────── Drawing management ────────

  /**
   * Fixed logical image size in pixels.
   * Must match the frontend constant (BoardSceneComponent.IMAGE_SIZE_IN_PX).
   */
  private static readonly IMAGE_SIZE_PX = 400;

  /** The relative size of an image in normalized 0..1 coords at the current field size. */
  public getRelativeImageSize(): number {
    return GameStore.IMAGE_SIZE_PX / this.state.effectiveFieldWidth;
  }

  public addDrawing(args: { playerId: string; imageDataUrl: string; prompt: string }): Drawing {
    const id = crypto.randomUUID();

    // Recalc field size BEFORE placement so the new drawing is accounted for.
    // We temporarily bump the count by +1 for the calc.
    const countAfter = Object.keys(this.state.drawings).length + 1;
    this.recalcEffectiveFieldSize(countAfter);

    const position = this.findBestPlacement();

    const drawing: Drawing = {
      id,
      artistId: args.playerId,
      prompt: args.prompt,
      imageDataUrl: args.imageDataUrl,
      x: position.x,
      y: position.y,
      placedAt: Date.now(),
      foundBy: null,
      foundAt: null,
    };

    this.state.drawings[id] = drawing;
    this.bumpRevision();
    return drawing;
  }

  /**
   * Recalculate the effective field dimensions.
   * @param count  Number of drawings (defaults to current count).
   */
  private recalcEffectiveFieldSize(count?: number): void {
    const n = count ?? Object.keys(this.state.drawings).length;
    // Base size 400, grows by ~60 per drawing, capped at 2000
    const size = Math.min(2000, Math.round(400 + n * 60));
    this.state.effectiveFieldWidth = size;
    this.state.effectiveFieldHeight = size;
  }

  /**
   * Place a new drawing using Poisson-disk-like sampling.
   *
   * All coordinates are normalized 0..1.
   * The image occupies `relSize × relSize` in normalized space where
   * `relSize = IMAGE_SIZE_PX / effectiveFieldWidth`.
   * The placement radius grows with the number of drawings so that
   * density stays roughly constant.
   */
  private findBestPlacement(): { x: number; y: number } {
    const existingDrawings = Object.values(this.state.drawings);
    const relSize = this.getRelativeImageSize();
    // Half-image + small gap so drawings don't touch
    const halfImg = relSize / 2;
    const gap = 0.02;
    const margin = halfImg + gap;

    if (existingDrawings.length === 0) {
      return {
        x: 0.5 + (Math.random() - 0.5) * 0.05,
        y: 0.5 + (Math.random() - 0.5) * 0.05,
      };
    }

    // The placement circle grows so there is always room for new images.
    // At the current relSize, each image "consumes" roughly relSize² of area.
    // We want the circle area to be proportional to count × relSize².
    const count = existingDrawings.length;
    const maxRadius = 0.5 - margin;
    // Base radius = just big enough for the first image; grows with sqrt(count)
    const baseRadius = relSize * 0.8;
    const circleRadius = Math.min(maxRadius, baseRadius + relSize * 0.6 * Math.sqrt(count));

    // Minimum distance between centres to avoid overlap
    const minSeparation = relSize * 0.85;

    const CANDIDATE_ATTEMPTS = 60;
    let bestCandidate = { x: 0.5, y: 0.5 };
    let bestMinDistance = -1;

    for (let attempt = 0; attempt < CANDIDATE_ATTEMPTS; attempt++) {
      const angle = Math.random() * 2 * Math.PI;
      const r = circleRadius * Math.sqrt(Math.random());
      const cx = 0.5 + r * Math.cos(angle);
      const cy = 0.5 + r * Math.sin(angle);

      // Stay inside the field with enough room for the image
      if (cx < margin || cx > 1 - margin || cy < margin || cy > 1 - margin) {
        continue;
      }

      let minDist = Infinity;
      for (const d of existingDrawings) {
        const dist = Math.sqrt((cx - d.x) ** 2 + (cy - d.y) ** 2);
        if (dist < minDist) minDist = dist;
      }

      // Prefer candidates that maximize distance to nearest neighbour
      if (minDist > bestMinDistance) {
        bestMinDistance = minDist;
        bestCandidate = { x: cx, y: cy };
      }
    }

    return bestCandidate;
  }

  public checkSearchSnapshot(args: {
    playerId: string;
    centerX: number;
    centerY: number;
    radius: number;
    expectedDrawingId: string;
  }): { correct: boolean; drawing: Drawing | null; artist: Player | null } {
    const drawing = this.state.drawings[args.expectedDrawingId];
    if (!drawing) {
      return { correct: false, drawing: null, artist: null };
    }

    const distanceToDrawing = Math.sqrt((args.centerX - drawing.x) ** 2 + (args.centerY - drawing.y) ** 2);
    const halfImage = this.getRelativeImageSize() / 2;
    const isWithinRange = distanceToDrawing <= args.radius + halfImage;

    if (isWithinRange && !drawing.foundBy) {
      drawing.foundBy = args.playerId;
      drawing.foundAt = Date.now();

      const searcher = this.state.players[args.playerId];
      const artist = this.state.players[drawing.artistId];
      if (searcher) {
        searcher.score += 1;
      }
      if (artist && artist.id !== args.playerId) {
        artist.score += 1;
      }
      this.bumpRevision();
      return { correct: true, drawing, artist: artist ?? null };
    }

    return { correct: false, drawing: null, artist: null };
  }

  // ──────── Task assignment ────────

  /** Check if a player session belongs to a ready player (has name + avatar) */
  private isReadyPlayer(session: PlayerSession): boolean {
    if (session.kind !== "player") {
      return false;
    }
    const player = this.state.players[session.playerId];
    return !!player && !!player.name && !!player.avatarDataUrl;
  }

  /** Find the session for a given playerId */
  private findSessionByPlayerId(playerId: string): PlayerSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.playerId === playerId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Batch-assign draw prompts for all active player sessions at round start.
   * Stored in state.promptAssignments so they persist across reconnects.
   */
  private batchAssignDrawPrompts(): void {
    this.state.promptAssignments = {};

    const processedPlayerIds = new Set<string>();
    for (const session of this.sessions.values()) {
      if (!this.isReadyPlayer(session)) {
        continue;
      }
      if (processedPlayerIds.has(session.playerId)) {
        continue;
      }
      processedPlayerIds.add(session.playerId);

      const maxDrawCount = this.config.maxDrawingsPerRound > 0 ? this.config.maxDrawingsPerRound : 3;
      const prompts: string[] = [];
      for (let i = 0; i < maxDrawCount; i++) {
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
        activeSearchDrawingId: null,
      };
    }
  }

  /**
   * Batch-assign search tasks for all active player sessions at search phase start.
   */
  private batchAssignSearchTasks(): void {
    const processedPlayerIds = new Set<string>();
    for (const session of this.sessions.values()) {
      if (!this.isReadyPlayer(session)) {
        continue;
      }
      if (processedPlayerIds.has(session.playerId)) {
        continue;
      }
      processedPlayerIds.add(session.playerId);

      const assignment = this.state.promptAssignments[session.playerId];
      if (!assignment) {
        continue;
      }

      const unfoundDrawings = this.getUnfoundDrawingsForPlayer(session.playerId, session.usedSearchIds);
      const shuffled = GameStore.shuffle([...unfoundDrawings]);

      assignment.searchTasks = shuffled.map((drawing) => {
        const artist = this.state.players[drawing.artistId];
        return { drawingId: drawing.id, prompt: drawing.prompt, artistName: artist?.name || "Unbekannt" };
      });
      assignment.searchTaskIndex = 0;
      assignment.activeSearchDrawingId = null;
    }
  }

  public assignDrawTask(clientId: string): PlayerTask | null {
    const session = this.sessions.get(clientId);
    if (!session) {
      console.log(`[assignDrawTask] No session for clientId ${clientId}`);
      return null;
    }

    const assignment = this.state.promptAssignments[session.playerId];
    if (!assignment || assignment.drawPromptIndex >= assignment.drawPrompts.length) {
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

    console.log(`[assignDrawTask] player=${session.playerId.slice(0, 8)} clientId=${clientId.slice(0, 12)} drawIndex=${drawIndex}/${assignment.drawPrompts.length} prompt="${prompt.slice(0, 30)}"`);

    return { mode: "DRAW", prompt, drawIndex, drawTotal: assignment.drawPrompts.length };
  }

  public assignSearchTask(clientId: string): PlayerTask | null {
    const session = this.sessions.get(clientId);
    if (!session) {
      return null;
    }

    const assignment = this.state.promptAssignments[session.playerId];
    if (!assignment) {
      return null;
    }

    // Skip already-found drawings
    while (assignment.searchTaskIndex < assignment.searchTasks.length) {
      const candidate = assignment.searchTasks[assignment.searchTaskIndex];
      const drawing = this.state.drawings[candidate.drawingId];
      if (drawing && !drawing.foundBy) {
        break;
      }
      assignment.searchTaskIndex++;
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
   * Also syncs the session state so the submit-drawing handler works.
   */
  public getCurrentDrawTaskForPlayer(playerId: string): PlayerTask | null {
    const assignment = this.state.promptAssignments[playerId];
    if (!assignment?.activeDrawPrompt) {
      return null;
    }

    const prompt = assignment.activeDrawPrompt;
    const drawIndex = Math.max(0, assignment.drawPromptIndex - 1);

    const session = this.findSessionByPlayerId(playerId);
    if (session) {
      session.currentDrawPrompt = prompt;
      session.currentSearchDrawingId = null;
    }

    return { mode: "DRAW", prompt, drawIndex, drawTotal: assignment.drawPrompts.length };
  }

  /**
   * Get the current search task for a reconnecting player without advancing the index.
   * Also syncs the session state so the search-snapshot handler works.
   */
  public getCurrentSearchTaskForPlayer(playerId: string): PlayerTask | null {
    const assignment = this.state.promptAssignments[playerId];
    if (!assignment?.activeSearchDrawingId) {
      return null;
    }

    const drawingId = assignment.activeSearchDrawingId;
    const drawing = this.state.drawings[drawingId];
    if (!drawing || drawing.foundBy) {
      assignment.activeSearchDrawingId = null;
      return null;
    }

    const artist = this.state.players[drawing.artistId];
    const session = this.findSessionByPlayerId(playerId);
    if (session) {
      session.currentSearchDrawingId = drawingId;
      session.currentDrawPrompt = null;
    }

    return { mode: "SEARCH", prompt: drawing.prompt, drawingId, artistName: artist?.name || "Unbekannt" };
  }

  private getUnfoundDrawingsForPlayer(playerId: string, usedSearchIds: Set<string>): Drawing[] {
    return Object.values(this.state.drawings).filter(
      (drawing) => !drawing.foundBy && drawing.artistId !== playerId && !usedSearchIds.has(drawing.id)
    );
  }

  // ──────── Prompt assignment state access ────────

  public clearActiveDrawPrompt(playerId: string): void {
    const assignment = this.state.promptAssignments[playerId];
    if (assignment) {
      assignment.activeDrawPrompt = null;
    }
  }

  public clearActiveSearchTask(playerId: string): void {
    const assignment = this.state.promptAssignments[playerId];
    if (assignment) {
      assignment.activeSearchDrawingId = null;
    }
  }

  public getActiveDrawPrompt(playerId: string): string | null {
    return this.state.promptAssignments[playerId]?.activeDrawPrompt ?? null;
  }

  public getActiveSearchDrawingId(playerId: string): string | null {
    return this.state.promptAssignments[playerId]?.activeSearchDrawingId ?? null;
  }

  private pickDrawPrompt(usedPrompts: Set<string>): string {
    // Try to find an unused prompt from the pool
    for (let i = this.promptPool.length - 1; i >= 0; i--) {
      if (!usedPrompts.has(this.promptPool[i])) {
        return this.promptPool.splice(i, 1)[0];
      }
    }
    // Pool exhausted — reshuffle and try again
    this.promptPool = GameStore.shuffle([...this.config.drawPrompts]);
    for (let i = this.promptPool.length - 1; i >= 0; i--) {
      if (!usedPrompts.has(this.promptPool[i])) {
        return this.promptPool.splice(i, 1)[0];
      }
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

  private bumpRevision(): void {
    this.state.revision++;
    this.state.updatedAt = Date.now();
  }

  public static shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

