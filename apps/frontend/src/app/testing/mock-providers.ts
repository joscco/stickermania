import {signal, computed, inject, Injectable} from '@angular/core';
import type {
  StickerCollageGameState,
  StickerCollage,
  StickerPack,
  StickerCollageBuildingState,
  StickerCollageVotingState,
  StickerCollageResultsState,
  SessionState,
  MinigameTask,
  StickerPlaceTask,
  DrawingTask,
  ChoiceTask,
  NumberTask,
  TimerStopTask,
  ShapeSplitTask,
} from '@birthday/shared';
import {lobbyPhase, buildingPhase, votingPhase, resultsPhase, nextRoundPhase, makeGameState, makeSessionState, MOCK_SUBMISSIONS} from './mock-data';
import type {VotingViewModel, VotingVariant, ResultsViewModel, WinnerStep} from '../features/game/player/player-view-models';

@Injectable({providedIn: 'root'})
export class MockWorldStore {
  readonly sessionState = signal<SessionState | null>(makeSessionState(lobbyPhase()));
  readonly lastError = signal<string | null>(null);
  readonly players = computed(() => this.sessionState()?.players ?? {});
  readonly allPlayers = computed(() => Object.values(this.players()));
  readonly leaderboard = computed(() =>
    Object.values(this.players())
      .filter(p => p.name.trim().length > 0)
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
  );
  readonly stickerCollageGameState = computed(() => this.sessionState()?.gameState ?? null);
  setSessionState(state: SessionState) { this.sessionState.set(state); this.lastError.set(null); }
  clearSessionState() { this.sessionState.set(null); }
}

@Injectable({providedIn: 'root'})
export class MockGameSessionStore {
  readonly sessionId = signal('mock-session');
  readonly playerId = signal('player-1');
  readonly clientId = signal('mock-client');
  readonly playerName = signal('Anna');
  readonly currentMode = signal<'LOBBY' | 'STICKER_COLLAGE' | 'IDLE'>('STICKER_COLLAGE');
  readonly feedback = signal<{text: string; type: 'success' | 'error'} | null>(null);
  setSession(id: string) { this.sessionId.set(id); }
  setJoined(args: {sessionId: string; playerId: string; clientId: string}) {
    this.sessionId.set(args.sessionId);
    this.playerId.set(args.playerId);
    this.clientId.set(args.clientId);
  }
  clearTask(nextMode: 'LOBBY' | 'STICKER_COLLAGE' | 'IDLE' = 'IDLE') { this.currentMode.set(nextMode); }
  showFeedback(text: string, type: 'success' | 'error') { this.feedback.set({text, type}); }
}

@Injectable({providedIn: 'root'})
export class MockWebSocketService {
  readonly status = signal<'idle' | 'connecting' | 'connected' | 'disconnected'>('connected');
  private _wasConnected = true;
  wasConnected() { return this._wasConnected; }
  send(_msg: any) {}
  connect() { this.status.set('connected'); }
  disconnect() { this.status.set('disconnected'); }
  onMessage(_listener: (msg: any) => void): () => void { return () => {}; }
  updatePendingJoin(_msg: any) {}
}

@Injectable({providedIn: 'root'})
export class MockStickerPlayerService {
  private readonly worldStore = inject(WorldStore);
  private readonly sessionStore = inject(GameSessionStore);

  readonly gameState = computed<StickerCollageGameState | null>(() =>
    this.worldStore.stickerCollageGameState()
  );

  private readonly buildingState = computed<StickerCollageBuildingState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === 'BUILDING' ? ps as StickerCollageBuildingState : null;
  });
  private readonly votingState = computed<StickerCollageVotingState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === 'VOTING' ? ps as StickerCollageVotingState : null;
  });
  private readonly resultsState = computed<StickerCollageResultsState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === 'RESULTS' ? ps as StickerCollageResultsState : null;
  });

  readonly currentPrompt = computed(() => this.gameState()?.currentPrompt ?? '');
  readonly currentTask = computed<MinigameTask | null>(() => this.gameState()?.currentTask ?? null);
  readonly currentRoundIndex = computed(() => this.gameState()?.currentRoundIndex ?? 0);
  readonly phase = computed(() => this.gameState()?.phaseState.phase ?? 'LOBBY');
  readonly stickerCatalog = computed(() => this.gameState()?.stickerCatalog ?? []);
  readonly votesPerPlayer = computed(() => this.gameState()?.votesPerPlayer ?? 3);
  readonly maxStickersOnCanvas = computed(() => this.gameState()?.maxStickersOnCanvas ?? 12);
  readonly hasSubmittedThisRound = computed(() => {
    const playerId = this.sessionStore.playerId();
    const ms = this.gameState();
    if (!playerId || !ms) return false;
    const collages = (ms.submissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    const minigames = (ms.minigameSubmissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    return collages || minigames;
  });
  readonly hasSkippedThisRound = computed(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return this.buildingState()?.skippedPlayerIds.includes(playerId) ?? false;
  });
  readonly allPlayersDone = computed(() => {
    const ms = this.gameState();
    const ps = this.buildingState();
    const players = this.worldStore.players();
    if (!ms || !ps) return false;
    const activeIds = ms.roundParticipantIds.filter(id => players[id]?.connected);
    if (activeIds.length === 0) return false;
    const submittedIds = new Set((ms.submissions[ms.currentRoundIndex] ?? []).map(s => s.playerId));
    const minigameIds = new Set((ms.minigameSubmissions[ms.currentRoundIndex] ?? []).map(s => s.playerId));
    const skippedIds = new Set(ps.skippedPlayerIds);
    return activeIds.every(id => submittedIds.has(id) || minigameIds.has(id) || skippedIds.has(id));
  });
  readonly currentRoundSubmissions = computed<StickerCollage[]>(() => {
    const ms = this.gameState();
    if (!ms) return [];
    return ms.submissions[ms.currentRoundIndex] ?? [];
  });
  readonly myVotes = computed<string[]>(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return [];
    return this.votingState()?.currentVotes[playerId] ?? [];
  });
  readonly myDoneVoting = computed(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return this.votingState()?.doneVotingIds.includes(playerId) ?? false;
  });
  readonly allVotingDone = computed(() => {
    const ms = this.gameState();
    const ps = this.votingState();
    const players = this.worldStore.players();
    if (!ms || !ps) return false;
    const connectedIds = ms.roundParticipantIds.filter(id => players[id]?.connected);
    return connectedIds.length > 0 && connectedIds.every(id => ps.doneVotingIds.includes(id));
  });
  readonly lastVoteResults = computed(() => this.resultsState()?.lastVoteResults ?? []);
  readonly winnerId = computed(() => this.resultsState()?.winnerId ?? null);
  readonly isWinner = computed(() => this.sessionStore.playerId() === this.winnerId());
  readonly isTiedWinner = computed(() => {
    const pid = this.sessionStore.playerId();
    if (!pid) return false;
    return (this.resultsState()?.tiedWinnerIds ?? []).includes(pid);
  });
  readonly myPlacement = computed<number | null>(() => {
    const playerId = this.sessionStore.playerId();
    const r = this.lastVoteResults();
    if (!playerId || r.length === 0) return null;
    const myResult = r.find(r => r.playerId === playerId);
    return myResult?.placement ?? null;
  });
  readonly promptChoices = computed(() => this.resultsState()?.promptChoices ?? []);
  readonly packUnlockChoices = computed<StickerPack[]>(() => {
    const ms = this.gameState();
    const ps = this.resultsState();
    if (!ms || !ps) return [];
    return ps.packUnlockChoices.map(id => ms.stickerPacks.find(p => p.id === id)).filter((p): p is StickerPack => !!p);
  });
  readonly winnerChoicesDone = computed(() => this.resultsState()?.winnerChoicesDone ?? false);
  readonly hasChosenPrompt = computed(() => {
    const ms = this.gameState();
    return !!ms && !!ms.promptHistory[ms.currentRoundIndex + 1];
  });
  readonly hasUnlockedPack = computed(() => !!(this.resultsState()?.lastUnlockedPackId));
  readonly hasLockedPacks = computed(() => (this.resultsState()?.packUnlockChoices ?? []).length > 0);
  readonly canReadyToAdvance = computed(() => this.resultsState()?.winnerChoicesDone ?? true);
  readonly stickerPacks = computed(() => this.gameState()?.stickerPacks ?? []);
  readonly unlockedPackIds = computed(() => this.gameState()?.unlockedPackIds ?? []);
  readonly lastUnlockedPackId = computed(() => this.resultsState()?.lastUnlockedPackId ?? null);
  requestHand() {}
  submitCollage(_placements: any[]) {}
  skipRound() {}
  castVote(_collageId: string) {}
  doneVoting() {}
  readyToAdvance() {}
  startGame() {}
  endRoundEarly() {}
  endVotingEarly() {}
  pickPrompt(_prompt: string) {}
  unlockPack(_packId: string) {}

}

import {WorldStore} from '../core/world.store';
import {GameSessionStore} from '../core/challenge.store';
import {WebSocketService} from '../core/websocket.service';
import {StickerPlayerService} from '../features/game/services/sticker-player.service';

export type MockPhase = 'lobby' | 'building' | 'building-submitted' | 'building-skipped' | 'voting' | 'voting-done' | 'voting-all-done' | 'results' | 'next-round';

export const MOCK_TASKS: Record<string, MinigameTask> = {
  stickerPlace: {id: 'mock-sticker', type: 'sticker-place', title: 'Platziere das Herz!', durationSec: 30, stickerSvgs: ['sticker-shapes-heart']} as StickerPlaceTask,
  drawing: {id: 'mock-drawing', type: 'drawing', title: 'Zeichne einen Bart!', durationSec: 60} as DrawingTask,
  choice: {id: 'mock-choice', type: 'choice', title: 'Wähle deinen Lieblingskäse', durationSec: 30, options: [{label: 'Gouda'}, {label: 'Cheddar'}, {label: 'Brie'}, {label: 'Camembert'}]} as ChoiceTask,
  number: {id: 'mock-number', type: 'number', title: 'Wie viele Kinder?', durationSec: 30, min: 0, max: 10, default: 2} as NumberTask,
  timer: {id: 'mock-timer', type: 'timer-stop', title: 'Stoppe bei 5 Sekunden!', durationSec: 30, targetSec: 5} as TimerStopTask,
  shapeSplit: {id: 'mock-split', type: 'shape-split', title: 'Teile die Fläche 50:50!', durationSec: 45, polygon: [], targetFraction: 0.5} as ShapeSplitTask,
  textAnswer: {id: 'mock-text', type: 'text-answer', title: 'Nenne ein Gericht vom Italiener!', durationSec: 30, voteQuestion: 'Welches Gericht hat mehr Kalorien?'} as import("@birthday/shared").TextAnswerTask,
  thesis: {id: 'mock-thesis', type: 'thesis', title: 'Ananas auf Pizza ist legitim', durationSec: 30} as import("@birthday/shared").ThesisTask,
};

export function makeMockSessionState(phase: MockPhase, taskKey?: keyof typeof MOCK_TASKS, customTask?: MinigameTask): SessionState {
  const submissions = {0: MOCK_SUBMISSIONS} as Record<number, StickerCollage[]>;
  const task = customTask ?? (taskKey ? MOCK_TASKS[taskKey] : null);
  switch (phase) {
    case 'lobby':
      return makeSessionState(lobbyPhase());
    case 'building':
      return makeSessionState(buildingPhase(), undefined, task ? {currentTask: task, currentPrompt: task['title']} : undefined);
    case 'building-submitted': {
      const overrides: any = task ? {currentTask: task, currentPrompt: task['title']} : undefined;
      return makeSessionState(buildingPhase(), undefined, overrides ? {...overrides, submissions} : {submissions});
    }
    case 'building-skipped':
      return makeSessionState(buildingPhase({skippedPlayerIds: ['player-1']}), undefined, task ? {currentTask: task, currentPrompt: task['title']} : undefined);
    case 'voting': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      return makeSessionState(votingPhase({currentVotes: {'player-1': ['col-2'], 'player-2': ['col-1']}, doneVotingIds: []}), undefined, overrides);
    }
    case 'voting-done': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      return makeSessionState(votingPhase({currentVotes: {'player-1': ['col-2', 'col-3']}, doneVotingIds: ['player-1']}), undefined, overrides);
    }
    case 'voting-all-done': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      return makeSessionState(votingPhase({currentVotes: {'player-1': ['col-2', 'col-3'], 'player-2': ['col-1'], 'player-3': ['col-1', 'col-2']}, doneVotingIds: ['player-1', 'player-2', 'player-3']}), undefined, overrides);
    }
    case 'results': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      return makeSessionState(resultsPhase(), undefined, overrides);
    }
    case 'next-round':
      return makeSessionState(nextRoundPhase());
  }
}

export function provideMockState(phase: MockPhase, taskKey?: keyof typeof MOCK_TASKS, customTask?: MinigameTask) {
  const worldStore = new MockWorldStore();
  const sessionStore = new MockGameSessionStore();
  const submissions = {0: MOCK_SUBMISSIONS} as Record<number, StickerCollage[]>;

  let sessionState: SessionState;
  const task = customTask ?? (taskKey ? MOCK_TASKS[taskKey] : null);
  switch (phase) {
    case 'lobby':
      sessionState = makeSessionState(lobbyPhase());
      break;
    case 'building':
      sessionState = makeSessionState(buildingPhase(), undefined, task ? {currentTask: task, currentPrompt: task['title']} : undefined);
      break;
    case 'building-submitted': {
      const overrides = task ? {currentTask: task, currentPrompt: task['title']} : undefined;
      sessionState = makeSessionState(buildingPhase(), undefined, overrides ? {...overrides, submissions} : {submissions});
      break;
    }
    case 'building-skipped':
      sessionState = makeSessionState(buildingPhase({skippedPlayerIds: ['player-1']}), undefined, task ? {currentTask: task, currentPrompt: task['title']} : undefined);
      break;
    case 'voting': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      sessionState = makeSessionState(votingPhase({currentVotes: {'player-1': ['col-2'], 'player-2': ['col-1']}, doneVotingIds: []}), undefined, overrides);
      break;
    }
    case 'voting-done': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      sessionState = makeSessionState(votingPhase({currentVotes: {'player-1': ['col-2', 'col-3']}, doneVotingIds: ['player-1']}), undefined, overrides);
      break;
    }
    case 'voting-all-done': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      sessionState = makeSessionState(votingPhase({currentVotes: {'player-1': ['col-2', 'col-3'], 'player-2': ['col-1'], 'player-3': ['col-1', 'col-2']}, doneVotingIds: ['player-1', 'player-2', 'player-3']}), undefined, overrides);
      break;
    }
    case 'results': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      sessionState = makeSessionState(resultsPhase(), undefined, overrides);
      break;
    }
    case 'next-round':
      sessionState = makeSessionState(nextRoundPhase());
      break;
  }

  worldStore.setSessionState(sessionState);

  return { worldStore, sessionStore, providers: [] as any[] };
}

export function getMockVotingVm(phase: MockPhase, worldStore: MockWorldStore, sessionStore: MockGameSessionStore, stickerService: MockStickerPlayerService): VotingViewModel {
  let variant: VotingVariant = 'active';
  if (phase === 'voting-done') variant = 'done';
  if (phase === 'voting-all-done') variant = 'all-done';

  return {
    variant,
    prompt: stickerService.currentPrompt(),
    submissions: stickerService.currentRoundSubmissions(),
    stickerCatalog: stickerService.stickerCatalog(),
    myVotes: stickerService.myVotes(),
    votesRemaining: (stickerService.gameState()?.votesPerPlayer ?? 3) - stickerService.myVotes().length,
    players: worldStore.players(),
    myPlayerId: sessionStore.playerId(),
  };
}

export function getMockResultsVm(worldStore: MockWorldStore, sessionStore: MockGameSessionStore, stickerService: MockStickerPlayerService): ResultsViewModel {
  const isWinner = stickerService.isWinner();
  const winnerChoicesDone = stickerService.winnerChoicesDone();
  const hasChosenPrompt = stickerService.hasChosenPrompt();
  const hasLockedPacks = stickerService.hasLockedPacks();
  const hasUnlockedPack = stickerService.hasUnlockedPack();
  const promptChoices = stickerService.promptChoices();
  const packUnlockChoices = stickerService.packUnlockChoices();

  let currentWinnerStep: WinnerStep = null;
  if (isWinner && !winnerChoicesDone) {
    if (!hasChosenPrompt && promptChoices.length > 0) {
      currentWinnerStep = 'prompt';
    } else if (hasChosenPrompt && !hasUnlockedPack && packUnlockChoices.length > 0) {
      currentWinnerStep = 'unlock';
    }
  }

  const winnerId = stickerService.winnerId();
  const myResult = stickerService.lastVoteResults().find(r => r.playerId === (sessionStore.playerId() ?? ''));
  return {
    myPlacement: stickerService.myPlacement(),
    myVoteCount: myResult?.voteCount ?? 0,
    isWinner,
    isTiedWinner: stickerService.isTiedWinner(),
    winnerChoicesDone,
    currentWinnerStep,
    hasChosenPrompt,
    hasLockedPacks,
    hasUnlockedPack,
    promptChoices,
    packUnlockChoices,
    winnerId,
    winnerName: winnerId ? (worldStore.players()[winnerId]?.name ?? 'Der Gewinner') : '',
    canReadyToAdvance: stickerService.canReadyToAdvance(),
  };
}