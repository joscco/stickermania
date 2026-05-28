import {computed, inject, Injectable, signal} from '@angular/core';
import type {MinigameTask, SessionState, RoundSubmission, PartyGameState, PartyRoundActiveState, PartyRoundResultsState} from '@birthday/shared';
import {roundActivePhase, lobbyPhase, makeSessionState, MOCK_SUBMISSIONS, resultsPhase} from './mock-data';
import {WorldStore} from '../core/world.store';
import {GameSessionStore} from '../core/challenge.store';

@Injectable({providedIn: 'root'})
export class MockWorldStore {
  readonly sessionState = signal<SessionState | null>(makeSessionState(lobbyPhase()));
  readonly lastError = signal<string | null>(null);
  readonly players = computed(() => this.sessionState()?.players ?? {});
  readonly partyGameState = computed(() => this.sessionState()?.gameState ?? null);
  setSessionState(state: SessionState) { this.sessionState.set(state); this.lastError.set(null); }
  clearSessionState() { this.sessionState.set(null); }
}

@Injectable({providedIn: 'root'})
export class MockGameSessionStore {
  readonly sessionId = signal('mock-session');
  readonly playerId = signal('player-1');
  readonly clientId = signal('mock-client');
  readonly playerName = signal('Anna');
  readonly currentMode = signal<'LOBBY' | 'PARTY_GAME' | 'IDLE'>('PARTY_GAME');
  readonly feedback = signal<{text: string; type: 'success' | 'error'} | null>(null);
  setSession(id: string) { this.sessionId.set(id); }
  setJoined(args: {sessionId: string; playerId: string; clientId: string}) {
    this.sessionId.set(args.sessionId);
    this.playerId.set(args.playerId);
    this.clientId.set(args.clientId);
  }
  clearTask(nextMode: 'LOBBY' | 'PARTY_GAME' | 'IDLE' = 'IDLE') { this.currentMode.set(nextMode); }
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
export class MockPartyPlayerService {
  private readonly worldStore = inject(WorldStore);
  private readonly sessionStore = inject(GameSessionStore);

  readonly gameState = computed<PartyGameState | null>(() =>
    this.worldStore.partyGameState()
  );

  private readonly roundActiveState = computed<PartyRoundActiveState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === 'ROUND_ACTIVE' ? ps as PartyRoundActiveState : null;
  });
  private readonly resultsState = computed<PartyRoundResultsState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === 'ROUND_RESULTS' ? ps as PartyRoundResultsState : null;
  });

  readonly currentPrompt = computed(() => this.gameState()?.currentPrompt ?? '');
  readonly currentTask = computed<MinigameTask | null>(() => this.gameState()?.currentTask ?? null);
  readonly currentRoundIndex = computed(() => this.gameState()?.currentRoundIndex ?? 0);
  readonly phase = computed(() => this.gameState()?.phaseState.phase ?? 'LOBBY');
  readonly hasSubmittedThisRound = computed(() => {
    const playerId = this.sessionStore.playerId();
    const ms = this.gameState();
    if (!playerId || !ms) return false;
    const submissions = (ms.submissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    const minigames = (ms.minigameSubmissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    return submissions || minigames;
  });
  readonly hasSkippedThisRound = computed(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return this.roundActiveState()?.skippedPlayerIds.includes(playerId) ?? false;
  });
  readonly allPlayersDone = computed(() => {
    const ms = this.gameState();
    const ps = this.roundActiveState();
    const players = this.worldStore.players();
    if (!ms || !ps) return false;
    const activeIds = ms.roundParticipantIds.filter(id => players[id]?.connected);
    if (activeIds.length === 0) return false;
    const submittedIds = new Set((ms.submissions[ms.currentRoundIndex] ?? []).map(s => s.playerId));
    const minigameIds = new Set((ms.minigameSubmissions[ms.currentRoundIndex] ?? []).map(s => s.playerId));
    const skippedIds = new Set(ps.skippedPlayerIds);
    return activeIds.every(id => submittedIds.has(id) || minigameIds.has(id) || skippedIds.has(id));
  });
  readonly currentRoundSubmissions = computed<RoundSubmission[]>(() => {
    const ms = this.gameState();
    if (!ms) return [];
    return ms.submissions[ms.currentRoundIndex] ?? [];
  });
  readonly currentRoundMinigameSubmissions = computed(() => {
    const ms = this.gameState();
    if (!ms) return [];
    return ms.minigameSubmissions[this.currentRoundIndex()] ?? [];
  });
  readonly lastResults = computed(() => this.resultsState()?.lastResults ?? []);
  readonly winnerId = computed(() => this.resultsState()?.winnerId ?? null);
  readonly isWinner = computed(() => this.sessionStore.playerId() === this.winnerId());
  readonly isTiedWinner = computed(() => {
    const pid = this.sessionStore.playerId();
    if (!pid) return false;
    return (this.resultsState()?.tiedWinnerIds ?? []).includes(pid);
  });
  readonly myPlacement = computed<number | null>(() => {
    const playerId = this.sessionStore.playerId();
    const r = this.lastResults();
    if (!playerId || r.length === 0) return null;
    const myResult = r.find(r => r.playerId === playerId);
    return myResult?.placement ?? null;
  });
  skipRound() {}
  readyToAdvance() {}
  startGame() {}
  endRoundEarly() {}

}

export type MockPhase = 'lobby' | 'round-active' | 'round-submitted' | 'round-skipped' | 'round-results';

export const MOCK_TASKS: Record<string, MinigameTask> = {
  stickerPlace: {id: 'mock-sticker', type: 'sticker-place', title: 'Platziere das Herz!', durationSec: 30, stickerSvgs: ['sticker-shapes-heart']},
  drawing: {id: 'mock-drawing', type: 'drawing', title: 'Zeichne einen Bart!', durationSec: 60},
  choice: {id: 'mock-choice', type: 'choice', title: 'Wähle deinen Lieblingskäse', durationSec: 30, options: [{label: 'Gouda'}, {label: 'Cheddar'}, {label: 'Brie'}, {label: 'Camembert'}]},
  number: {id: 'mock-number', type: 'number', title: 'Wie viele Kinder?', durationSec: 30, min: 0, max: 10, default: 2},
  shapeSplit: {id: 'mock-split', type: 'shape-split', title: 'Teile die Fläche 50:50!', durationSec: 45, polygon: [], targetFraction: 0.5},
  textAnswer: {id: 'mock-text', type: 'text-answer', title: 'Nenne ein Gericht vom Italiener!', durationSec: 30, voteQuestion: 'Welches Gericht hat mehr Kalorien?'},
  thesis: {id: 'mock-thesis', type: 'thesis', title: 'Ananas auf Pizza ist legitim', durationSec: 30},
};

export function makeMockSessionState(phase: MockPhase, taskKey?: keyof typeof MOCK_TASKS, customTask?: MinigameTask): SessionState {
  const submissions = {0: MOCK_SUBMISSIONS} as Record<number, RoundSubmission[]>;
  const task = customTask ?? (taskKey ? MOCK_TASKS[taskKey] : null);
  switch (phase) {
    case 'lobby':
      return makeSessionState(lobbyPhase());
    case 'round-active':
      return makeSessionState(roundActivePhase(), undefined, task ? {currentTask: task, currentPrompt: task['title']} : undefined);
    case 'round-submitted': {
      const overrides: any = task ? {currentTask: task, currentPrompt: task['title']} : undefined;
      return makeSessionState(roundActivePhase(), undefined, overrides ? {...overrides, submissions} : {submissions});
    }
    case 'round-skipped':
      return makeSessionState(roundActivePhase({skippedPlayerIds: ['player-1']}), undefined, task ? {currentTask: task, currentPrompt: task['title']} : undefined);
    case 'round-results': {
      const overrides: any = { submissions };
      if (task) { overrides.currentTask = task; overrides.currentPrompt = task['title']; }
      return makeSessionState(resultsPhase(), undefined, overrides);
    }
  }
}
