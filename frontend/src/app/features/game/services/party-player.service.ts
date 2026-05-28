import {inject, Injectable, computed} from "@angular/core";
import type {
  PartyGameClientAction, PartyGameState, RoundSubmission,
  PartyRoundActiveState, PartyRoundResultsState,
  MinigameClientAction, MinigameTask,
} from "@birthday/shared";
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {WebSocketService} from '../../../core/websocket.service';

@Injectable()
export class PartyPlayerService {
  private readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  private readonly wsService = inject(WebSocketService);

  public readonly gameState = computed<PartyGameState | null>(() =>
    this.worldStore.partyGameState()
  );

  // ─── Phase helpers ───────────────────────────────────────────

  private readonly roundActiveState = computed<PartyRoundActiveState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "ROUND_ACTIVE" ? ps : null;
  });
  private readonly resultsState = computed<PartyRoundResultsState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "ROUND_RESULTS" ? ps : null;
  });

  // ─── General state ───────────────────────────────────────────

  public readonly currentPrompt = computed(() => {
    const task = this.gameState()?.currentTask;
    if (task?.title) return task.title;
    return this.gameState()?.currentPrompt ?? "";
  });
  public readonly currentTask = computed<MinigameTask | null>(() => this.gameState()?.currentTask ?? null);
  public readonly currentRoundIndex = computed(() => this.gameState()?.currentRoundIndex ?? 0);
  public readonly phase = computed(() => this.gameState()?.phaseState.phase ?? "LOBBY");

  // ─── Active round phase ──────────────────────────────────────

  public readonly hasSubmittedThisRound = computed<boolean>(() => {
    const playerId = this.sessionStore.playerId();
    const ms = this.gameState();
    if (!playerId || !ms) return false;
    const submissions = (ms.submissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    const minigames = (ms.minigameSubmissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    return submissions || minigames;
  });

  public readonly hasSkippedThisRound = computed<boolean>(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return this.roundActiveState()?.skippedPlayerIds.includes(playerId) ?? false;
  });

  /** True when every connected round participant has submitted or skipped — shows "Runde schließen" button. */
  public readonly allPlayersDone = computed<boolean>(() => {
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

  // ─── Round data ──────────────────────────────────────────────

  public readonly currentRoundSubmissions = computed<RoundSubmission[]>(() => {
    const ms = this.gameState();
    if (!ms) return [];
    return ms.submissions[ms.currentRoundIndex] ?? [];
  });

  public readonly currentRoundMinigameSubmissions = computed(() => {
    const ms = this.gameState();
    if (!ms) return [];
    return ms.minigameSubmissions[this.currentRoundIndex()] ?? [];
  });

  // ─── Results phase ───────────────────────────────────────────

  public readonly lastResults = computed(() => this.resultsState()?.lastResults ?? []);
  public readonly winnerId = computed(() => this.resultsState()?.winnerId ?? null);

  public readonly isWinner = computed(() => {
    const playerId = this.sessionStore.playerId();
    return !!playerId && playerId === this.winnerId();
  });

  public readonly isTiedWinner = computed(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return (this.resultsState()?.tiedWinnerIds ?? []).includes(playerId);
  });

  public readonly myPlacement = computed<number | null>(() => {
    const playerId = this.sessionStore.playerId();
    const r = this.lastResults();
    if (!playerId || r.length === 0) return null;
    const myResult = r.find(r => r.playerId === playerId);
    return myResult?.placement ?? null;
  });
  // ─── Actions ─────────────────────────────────────────────────

  public submitMinigame(action: MinigameClientAction): void {
    this.wsService.send({type: "game-action", action});
  }

  public skipRound(): void {
    this.sendAction({type: "skip-round"});
  }

  public readyToAdvance(): void {
    this.sendAction({type: "ready-to-advance"});
  }

  public startGame(): void {
    this.sendAction({type: "start-game"});
  }

  public endRoundEarly(): void {
    this.sendAction({type: "end-round-early"});
  }

  private sendAction(action: PartyGameClientAction): void {
    this.wsService.send({type: "game-action", action});
  }
}
