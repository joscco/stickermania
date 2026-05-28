import {inject, Injectable, computed} from "@angular/core";
import type {
  PartyGameClientAction, PartyGameState, RoundSubmission,
  PartyBuildingState, PartyVotingState, PartyResultsState,
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

  private readonly buildingState = computed<PartyBuildingState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "BUILDING" ? ps : null;
  });
  private readonly votingState = computed<PartyVotingState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "VOTING" ? ps : null;
  });
  private readonly resultsState = computed<PartyResultsState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "RESULTS" ? ps : null;
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

  // ─── Building phase ──────────────────────────────────────────

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
    return this.buildingState()?.skippedPlayerIds.includes(playerId) ?? false;
  });

  /** True when every connected round participant has submitted or skipped — shows "Runde schließen" button. */
  public readonly allPlayersDone = computed<boolean>(() => {
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

  // ─── Voting phase ────────────────────────────────────────────

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

  public readonly myVotes = computed<string[]>(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return [];
    return this.votingState()?.currentVotes[playerId] ?? [];
  });

  public readonly myDoneVoting = computed<boolean>(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return false;
    return this.votingState()?.doneVotingIds.includes(playerId) ?? false;
  });

  /** True when all currently connected round participants have signalled done-voting. */
  public readonly allVotingDone = computed<boolean>(() => {
    const ms = this.gameState();
    const ps = this.votingState();
    const players = this.worldStore.players();
    if (!ms || !ps) return false;
    const connectedIds = ms.roundParticipantIds.filter(id => players[id]?.connected);
    return connectedIds.length > 0 && connectedIds.every(id => ps.doneVotingIds.includes(id));
  });

  // ─── Results phase ───────────────────────────────────────────

  public readonly lastVoteResults = computed(() => this.resultsState()?.lastVoteResults ?? []);
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
    const r = this.lastVoteResults();
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

  public castVote(submissionId: string): void {
    this.sendAction({type: "cast-vote", submissionId});
  }

  public doneVoting(): void {
    this.sendAction({type: "done-voting"});
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

  public endVotingEarly(): void {
    this.sendAction({type: "end-voting-early"});
  }

  private sendAction(action: PartyGameClientAction): void {
    this.wsService.send({type: "game-action", action});
  }
}
