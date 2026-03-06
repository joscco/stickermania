import crypto from "node:crypto";
import { type Drawing, type GameConfig, type GameState, type Player, type PlayerTask, type RoundState } from "@birthday/shared";
import type { PlayerRuntimeSession } from "./sessionRuntimeTypes.js";

export class SessionGameEngine {
  private state: GameState;
  private readonly sessions = new Map<string, PlayerRuntimeSession>();
  private promptPool: string[];
  private readonly playerColors = new Map<string, string[]>();
  private readonly config: GameConfig;

  public constructor(args: { config: GameConfig; initial: GameState }) {
    this.config = args.config;
    this.state = args.initial;
    this.promptPool = SessionGameEngine.shuffle([...this.config.drawPrompts]);
    this.recalcEffectiveFieldSize();
  }

  public static createEmpty(args: { config: GameConfig; sessionId: string; sessionCode: string; now?: number }): GameState {
    const now = args.now ?? Date.now();
    return {
      sessionId: args.sessionId,
      sessionCode: args.sessionCode,
      players: {},
      drawings: {},
      round: SessionGameEngine.defaultRound(args.config),
      promptAssignments: {},
      effectiveFieldWidth: args.config.fieldBaseSize,
      effectiveFieldHeight: args.config.fieldBaseSize,
      revision: 0,
      updatedAt: now,
      createdAt: now,
      expiresAt: now + args.config.sessionTtlHours * 60 * 60 * 1000,
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

  public getState(): GameState {
    return this.state;
  }

  public getRound(): RoundState {
    return this.state.round;
  }

  public getSession(clientId: string): PlayerRuntimeSession | undefined {
    return this.sessions.get(clientId);
  }

  public getAllSessions(): PlayerRuntimeSession[] {
    return [...this.sessions.values()];
  }

  public removeSession(clientId: string): void {
    this.sessions.delete(clientId);
  }

  public purgeDisconnectedSessions(activeClientIds: Set<string>): void {
    for (const [clientId] of this.sessions.entries()) {
      if (!activeClientIds.has(clientId)) {
        this.sessions.delete(clientId);
      }
    }
  }

  public getPlayerColors(playerId: string): string[] {
    const existingColors = this.playerColors.get(playerId);
    if (existingColors) {
      return existingColors;
    }
    const assignedColors = SessionGameEngine.shuffle([...this.config.playerColors]).slice(0, this.config.colorsPerPlayer);
    this.playerColors.set(playerId, assignedColors);
    return assignedColors;
  }

  public joinPlayer(args: { clientId: string; kind: "player" | "board"; existingPlayerId?: string }): Player {
    let playerId = args.existingPlayerId ?? "";
    let player = playerId.length > 0 ? this.state.players[playerId] : undefined;

    if (!player) {
      playerId = crypto.randomUUID();
      player = {
        id: playerId,
        name: "",
        avatarUrl: null,
        avatarAssetPath: null,
        score: 0,
        joinedAt: Date.now(),
      };
      this.state.players[playerId] = player;
      this.bumpRevision();
    }

    this.sessions.set(args.clientId, {
      playerId,
      clientId: args.clientId,
      kind: args.kind,
      currentDrawPrompt: null,
      currentSearchDrawingId: null,
      usedDrawPrompts: new Set<string>(),
      usedSearchIds: new Set<string>(),
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

  public setPlayerAvatar(playerId: string, avatarUrl: string, avatarAssetPath: string): void {
    const player = this.state.players[playerId];
    if (!player) {
      return;
    }
    player.avatarUrl = avatarUrl;
    player.avatarAssetPath = avatarAssetPath;
    this.bumpRevision();
  }

  public setTimerConfig(drawDurationSec: number, searchDurationSec: number): void {
    this.state.round.drawDurationSec = Math.max(10, Math.min(600, drawDurationSec));
    this.state.round.searchDurationSec = Math.max(10, Math.min(600, searchDurationSec));
    this.bumpRevision();
  }

  public startDrawPhase(): void {
    this.state.round.phase = "DRAW";
    this.state.round.roundNumber += 1;
    this.state.round.endsAt = Date.now() + this.state.round.drawDurationSec * 1000;

    for (const runtimeSession of this.sessions.values()) {
      runtimeSession.drawCountThisRound = 0;
    }
    this.batchAssignDrawPrompts();
    this.bumpRevision();
  }

  public startSearchPhase(): void {
    this.state.round.phase = "SEARCH";
    this.state.round.endsAt = Date.now() + this.state.round.searchDurationSec * 1000;
    this.batchAssignSearchTasks();
    this.bumpRevision();
  }

  public endRound(): void {
    this.state.round.phase = "PAUSED";
    this.state.round.endsAt = 0;
    this.state.promptAssignments = {};
    this.bumpRevision();
  }

  public getRelativeImageSize(): number {
    return this.config.imageSizePx / this.state.effectiveFieldWidth;
  }

  public addDrawing(args: {
    drawingId: string;
    playerId: string;
    imageUrl: string;
    imageAssetPath: string;
    prompt: string;
  }): Drawing {
    const countAfterInsert = Object.keys(this.state.drawings).length + 1;
    this.recalcEffectiveFieldSize(countAfterInsert);

    const position = this.findBestPlacement();
    const drawing: Drawing = {
      id: args.drawingId,
      artistId: args.playerId,
      prompt: args.prompt,
      imageUrl: args.imageUrl,
      imageAssetPath: args.imageAssetPath,
      x: position.x,
      y: position.y,
      placedAt: Date.now(),
      foundBy: null,
      foundAt: null,
    };

    this.state.drawings[args.drawingId] = drawing;
    this.bumpRevision();
    return drawing;
  }

  private recalcEffectiveFieldSize(count?: number): void {
    const drawingCount = count ?? Object.keys(this.state.drawings).length;
    const fieldSize = Math.min(
      this.config.fieldMaxSize,
      Math.round(this.config.fieldBaseSize + drawingCount * this.config.fieldGrowthPerDrawing),
    );
    this.state.effectiveFieldWidth = fieldSize;
    this.state.effectiveFieldHeight = fieldSize;
  }

  private findBestPlacement(): { x: number; y: number } {
    const existingDrawings = Object.values(this.state.drawings);
    const relativeImageSize = this.getRelativeImageSize();
    const halfImageSize = relativeImageSize / 2;
    const gap = 0.01;
    const margin = halfImageSize + gap;

    if (existingDrawings.length === 0) {
      return {
        x: 0.5 + (Math.random() - 0.5) * relativeImageSize * 0.3,
        y: 0.5 + (Math.random() - 0.5) * relativeImageSize * 0.3,
      };
    }

    const maxRadius = 0.5 - margin;
    const candidateAttempts = 80;
    let bestCandidate = { x: 0.5, y: 0.5 };
    let bestMinDistance = -1;

    for (let attempt = 0; attempt < candidateAttempts; attempt += 1) {
      const angle = Math.random() * 2 * Math.PI;
      const radius = maxRadius * Math.sqrt(Math.random());
      const candidateX = 0.5 + radius * Math.cos(angle);
      const candidateY = 0.5 + radius * Math.sin(angle);

      if (candidateX < margin || candidateX > 1 - margin || candidateY < margin || candidateY > 1 - margin) {
        continue;
      }

      let minDistance = Infinity;
      for (const existingDrawing of existingDrawings) {
        const distance = Math.sqrt((candidateX - existingDrawing.x) ** 2 + (candidateY - existingDrawing.y) ** 2);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }

      if (minDistance > bestMinDistance) {
        bestMinDistance = minDistance;
        bestCandidate = { x: candidateX, y: candidateY };
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
    const halfImageSize = this.getRelativeImageSize() / 2;
    const isWithinRange = distanceToDrawing <= args.radius + halfImageSize;

    if (isWithinRange && !drawing.foundBy) {
      drawing.foundBy = args.playerId;
      drawing.foundAt = Date.now();

      const searchingPlayer = this.state.players[args.playerId];
      const artist = this.state.players[drawing.artistId];
      if (searchingPlayer) {
        searchingPlayer.score += 1;
      }
      if (artist && artist.id !== args.playerId) {
        artist.score += 1;
      }
      this.bumpRevision();
      return { correct: true, drawing, artist: artist ?? null };
    }

    return { correct: false, drawing: null, artist: null };
  }

  private isReadyPlayer(runtimeSession: PlayerRuntimeSession): boolean {
    if (runtimeSession.kind !== "player") {
      return false;
    }
    const player = this.state.players[runtimeSession.playerId];
    return !!player && !!player.name;
  }

  private findSessionByPlayerId(playerId: string): PlayerRuntimeSession | undefined {
    for (const runtimeSession of this.sessions.values()) {
      if (runtimeSession.playerId === playerId) {
        return runtimeSession;
      }
    }
    return undefined;
  }

  private batchAssignDrawPrompts(): void {
    this.state.promptAssignments = {};
    const processedPlayerIds = new Set<string>();

    for (const runtimeSession of this.sessions.values()) {
      if (!this.isReadyPlayer(runtimeSession) || processedPlayerIds.has(runtimeSession.playerId)) {
        continue;
      }
      processedPlayerIds.add(runtimeSession.playerId);

      const maxDrawCount = this.config.maxDrawingsPerRound > 0 ? this.config.maxDrawingsPerRound : 3;
      const prompts: string[] = [];
      for (let index = 0; index < maxDrawCount; index += 1) {
        const prompt = this.pickDrawPrompt(runtimeSession.usedDrawPrompts);
        runtimeSession.usedDrawPrompts.add(prompt);
        prompts.push(prompt);
      }

      this.state.promptAssignments[runtimeSession.playerId] = {
        drawPrompts: prompts,
        drawPromptIndex: 0,
        activeDrawPrompt: null,
        searchTasks: [],
        searchTaskIndex: 0,
        activeSearchDrawingId: null,
      };
    }
  }

  private batchAssignSearchTasks(): void {
    const processedPlayerIds = new Set<string>();
    for (const runtimeSession of this.sessions.values()) {
      if (!this.isReadyPlayer(runtimeSession) || processedPlayerIds.has(runtimeSession.playerId)) {
        continue;
      }
      processedPlayerIds.add(runtimeSession.playerId);

      const assignment = this.state.promptAssignments[runtimeSession.playerId];
      if (!assignment) {
        continue;
      }

      const unfoundDrawings = this.getUnfoundDrawingsForPlayer(runtimeSession.playerId, runtimeSession.usedSearchIds);
      assignment.searchTasks = SessionGameEngine.shuffle([...unfoundDrawings]).map((drawing) => {
        const artist = this.state.players[drawing.artistId];
        return { drawingId: drawing.id, prompt: drawing.prompt, artistName: artist?.name || "Unbekannt" };
      });
      assignment.searchTaskIndex = 0;
      assignment.activeSearchDrawingId = null;
    }
  }

  public assignDrawTask(clientId: string): PlayerTask | null {
    const runtimeSession = this.sessions.get(clientId);
    if (!runtimeSession) {
      return null;
    }
    const assignment = this.state.promptAssignments[runtimeSession.playerId];
    if (!assignment || assignment.drawPromptIndex >= assignment.drawPrompts.length) {
      return null;
    }

    const drawIndex = assignment.drawPromptIndex;
    const prompt = assignment.drawPrompts[drawIndex];
    assignment.drawPromptIndex += 1;
    assignment.activeDrawPrompt = prompt;

    runtimeSession.currentDrawPrompt = prompt;
    runtimeSession.currentSearchDrawingId = null;
    runtimeSession.lastTaskMode = "DRAW";
    runtimeSession.drawCountThisRound += 1;

    return { mode: "DRAW", prompt, drawIndex, drawTotal: assignment.drawPrompts.length };
  }

  public assignSearchTask(clientId: string): PlayerTask | null {
    const runtimeSession = this.sessions.get(clientId);
    if (!runtimeSession) {
      return null;
    }
    const assignment = this.state.promptAssignments[runtimeSession.playerId];
    if (!assignment) {
      return null;
    }

    while (assignment.searchTaskIndex < assignment.searchTasks.length) {
      const candidate = assignment.searchTasks[assignment.searchTaskIndex];
      const drawing = this.state.drawings[candidate.drawingId];
      if (drawing && !drawing.foundBy) {
        break;
      }
      assignment.searchTaskIndex += 1;
    }

    if (assignment.searchTaskIndex >= assignment.searchTasks.length) {
      return null;
    }

    const task = assignment.searchTasks[assignment.searchTaskIndex];
    assignment.searchTaskIndex += 1;
    assignment.activeSearchDrawingId = task.drawingId;
    runtimeSession.currentSearchDrawingId = task.drawingId;
    runtimeSession.currentDrawPrompt = null;
    runtimeSession.usedSearchIds.add(task.drawingId);
    runtimeSession.lastTaskMode = "SEARCH";
    return { mode: "SEARCH", prompt: task.prompt, drawingId: task.drawingId, artistName: task.artistName };
  }

  public getCurrentDrawTaskForPlayer(playerId: string): PlayerTask | null {
    const assignment = this.state.promptAssignments[playerId];
    if (!assignment?.activeDrawPrompt) {
      return null;
    }
    const runtimeSession = this.findSessionByPlayerId(playerId);
    if (runtimeSession) {
      runtimeSession.currentDrawPrompt = assignment.activeDrawPrompt;
      runtimeSession.currentSearchDrawingId = null;
    }
    return {
      mode: "DRAW",
      prompt: assignment.activeDrawPrompt,
      drawIndex: Math.max(0, assignment.drawPromptIndex - 1),
      drawTotal: assignment.drawPrompts.length,
    };
  }

  public getCurrentSearchTaskForPlayer(playerId: string): PlayerTask | null {
    const assignment = this.state.promptAssignments[playerId];
    if (!assignment?.activeSearchDrawingId) {
      return null;
    }
    const drawing = this.state.drawings[assignment.activeSearchDrawingId];
    if (!drawing || drawing.foundBy) {
      assignment.activeSearchDrawingId = null;
      return null;
    }
    const runtimeSession = this.findSessionByPlayerId(playerId);
    if (runtimeSession) {
      runtimeSession.currentSearchDrawingId = drawing.id;
      runtimeSession.currentDrawPrompt = null;
    }
    const artist = this.state.players[drawing.artistId];
    return { mode: "SEARCH", prompt: drawing.prompt, drawingId: drawing.id, artistName: artist?.name || "Unbekannt" };
  }

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

  public reset(): void {
    const preservedSessionId = this.state.sessionId;
    const preservedSessionCode = this.state.sessionCode;
    this.state = SessionGameEngine.createEmpty({
      config: this.config,
      sessionId: preservedSessionId,
      sessionCode: preservedSessionCode,
    });
    this.sessions.clear();
    this.playerColors.clear();
    this.promptPool = SessionGameEngine.shuffle([...this.config.drawPrompts]);
  }

  private getUnfoundDrawingsForPlayer(playerId: string, usedSearchIds: Set<string>): Drawing[] {
    return Object.values(this.state.drawings).filter((drawing) => {
      return !drawing.foundBy && drawing.artistId !== playerId && !usedSearchIds.has(drawing.id);
    });
  }

  private pickDrawPrompt(usedPrompts: Set<string>): string {
    for (let index = this.promptPool.length - 1; index >= 0; index -= 1) {
      if (!usedPrompts.has(this.promptPool[index])) {
        return this.promptPool.splice(index, 1)[0];
      }
    }
    this.promptPool = SessionGameEngine.shuffle([...this.config.drawPrompts]);
    for (let index = this.promptPool.length - 1; index >= 0; index -= 1) {
      if (!usedPrompts.has(this.promptPool[index])) {
        return this.promptPool.splice(index, 1)[0];
      }
    }
    return this.promptPool.pop() ?? this.config.drawPrompts[0] ?? "?";
  }

  private bumpRevision(): void {
    this.state.revision += 1;
    this.state.updatedAt = Date.now();
    this.state.expiresAt = Date.now() + this.config.sessionTtlHours * 60 * 60 * 1000;
  }

  public static shuffle<T>(values: T[]): T[] {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  }
}
