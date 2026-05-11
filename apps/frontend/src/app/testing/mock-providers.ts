import {signal, computed, inject, Injectable} from '@angular/core';
import type {
  StickerCollageGameState,
  StickerCollage,
  StickerPack,
  StickerHand,
  StickerCollageBuildingState,
  StickerCollageVotingState,
  StickerCollageResultsState,
  SessionState,
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
  readonly currentRoundIndex = computed(() => this.gameState()?.currentRoundIndex ?? 0);
  readonly phase = computed(() => this.gameState()?.phaseState.phase ?? 'LOBBY');
  readonly stickerCatalog = computed(() => this.gameState()?.stickerCatalog ?? []);
  readonly votesPerPlayer = computed(() => this.gameState()?.votesPerPlayer ?? 3);
  readonly maxStickersOnCanvas = computed(() => this.gameState()?.maxStickersOnCanvas ?? 12);
  readonly myHand = computed<StickerHand | null>(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return null;
    return this.buildingState()?.playerHands[playerId] ?? null;
  });
  readonly hasSubmittedThisRound = computed(() => {
    const playerId = this.sessionStore.playerId();
    const ms = this.gameState();
    if (!playerId || !ms) return false;
    return (ms.submissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
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
    const skippedIds = new Set(ps.skippedPlayerIds);
    return activeIds.every(id => submittedIds.has(id) || skippedIds.has(id));
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
  readonly myPlacement = computed<number | null>(() => {
    const playerId = this.sessionStore.playerId();
    const r = this.lastVoteResults();
    if (!playerId || r.length === 0) return null;
    const idx = r.findIndex(r => r.playerId === playerId);
    return idx >= 0 ? idx + 1 : null;
  });
  readonly promptChoices = computed(() => this.resultsState()?.promptChoices ?? []);
  readonly packUnlockChoices = computed<StickerPack[]>(() => {
    const ms = this.gameState();
    const ps = this.resultsState();
    if (!ms || !ps) return [];
    return ps.packUnlockChoices.map(id => ms.stickerPacks.find(p => p.id === id)).filter((p): p is StickerPack => !!p);
  });
  readonly guaranteedPackChoices = computed<StickerPack[]>(() => {
    const ms = this.gameState();
    const ps = this.resultsState();
    if (!ms || !ps) return [];
    return ps.guaranteedPackChoices.map(id => ms.stickerPacks.find(p => p.id === id)).filter((p): p is StickerPack => !!p);
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
  readonly guaranteedPackId = computed(() => this.gameState()?.guaranteedPackId ?? null);

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
  pickGuaranteedPack(_packId: string) {}
}

import {WorldStore} from '../core/world.store';
import {GameSessionStore} from '../core/challenge.store';
import {WebSocketService} from '../core/websocket.service';
import {StickerPlayerService} from '../features/game/services/sticker-player.service';

export type MockPhase = 'lobby' | 'building' | 'building-submitted' | 'building-skipped' | 'voting' | 'voting-done' | 'voting-all-done' | 'results' | 'next-round';

export function provideMockState(phase: MockPhase) {
  const worldStore = new MockWorldStore();
  const sessionStore = new MockGameSessionStore();
  const submissions = {0: MOCK_SUBMISSIONS} as Record<number, StickerCollage[]>;

  let sessionState: SessionState;
  switch (phase) {
    case 'lobby':
      sessionState = makeSessionState(lobbyPhase());
      break;
    case 'building':
      sessionState = makeSessionState(buildingPhase());
      break;
    case 'building-submitted':
      sessionState = makeSessionState(buildingPhase(), undefined, { submissions });
      break;
    case 'building-skipped':
      sessionState = makeSessionState(buildingPhase({skippedPlayerIds: ['player-1']}));
      break;
    case 'voting':
      sessionState = makeSessionState(votingPhase({
        currentVotes: {'player-1': ['col-2'], 'player-2': ['col-1']},
        doneVotingIds: [],
      }), undefined, { submissions });
      break;
    case 'voting-done':
      sessionState = makeSessionState(votingPhase({
        currentVotes: {'player-1': ['col-2', 'col-3']},
        doneVotingIds: ['player-1'],
      }), undefined, { submissions });
      break;
    case 'voting-all-done':
      sessionState = makeSessionState(votingPhase({
        currentVotes: {'player-1': ['col-2', 'col-3'], 'player-2': ['col-1'], 'player-3': ['col-1', 'col-2']},
        doneVotingIds: ['player-1', 'player-2', 'player-3'],
      }), undefined, { submissions });
      break;
    case 'results':
      sessionState = makeSessionState(resultsPhase(), undefined, { submissions });
      break;
    case 'next-round':
      sessionState = makeSessionState(nextRoundPhase());
      break;
  }

  worldStore.setSessionState(sessionState);

  return {
    worldStore,
    sessionStore,
    providers: [
      {provide: WorldStore, useValue: worldStore},
      {provide: GameSessionStore, useValue: sessionStore},
      {provide: WebSocketService, useClass: MockWebSocketService},
      {provide: StickerPlayerService, useClass: MockStickerPlayerService},
    ],
  };
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
    } else if (hasChosenPrompt && (hasUnlockedPack || !hasLockedPacks) && stickerService.guaranteedPackChoices().length > 0) {
      currentWinnerStep = 'guaranteed';
    }
  }

  const winnerId = stickerService.winnerId();
  const myResult = stickerService.lastVoteResults().find(r => r.playerId === (sessionStore.playerId() ?? ''));
  return {
    myPlacement: stickerService.myPlacement(),
    myVoteCount: myResult?.voteCount ?? 0,
    isWinner,
    winnerChoicesDone,
    currentWinnerStep,
    hasChosenPrompt,
    hasLockedPacks,
    hasUnlockedPack,
    promptChoices,
    packUnlockChoices,
    guaranteedPackChoices: stickerService.guaranteedPackChoices(),
    winnerId,
    winnerName: winnerId ? (worldStore.players()[winnerId]?.name ?? 'Der Gewinner') : '',
    canReadyToAdvance: stickerService.canReadyToAdvance(),
  };
}