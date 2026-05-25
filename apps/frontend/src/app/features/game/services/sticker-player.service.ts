import {inject, Injectable, computed} from "@angular/core";
import type {
  StickerCollageClientAction, StickerCollageGameState, StickerCollage,
  StickerPlacement, StickerPack,
  StickerCollageBuildingState, StickerCollageVotingState, StickerCollageResultsState,
  MinigameClientAction, MinigameTask,
} from "@birthday/shared";
import {GameSessionStore} from '../../../core/challenge.store';
import {WorldStore} from '../../../core/world.store';
import {WebSocketService} from '../../../core/websocket.service';

@Injectable()
export class StickerPlayerService {
  private readonly sessionStore = inject(GameSessionStore);
  private readonly worldStore = inject(WorldStore);
  private readonly wsService = inject(WebSocketService);

  public readonly gameState = computed<StickerCollageGameState | null>(() =>
    this.worldStore.stickerCollageGameState()
  );

  // ─── Phase helpers ───────────────────────────────────────────

  private readonly buildingState = computed<StickerCollageBuildingState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "BUILDING" ? ps : null;
  });
  private readonly votingState = computed<StickerCollageVotingState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "VOTING" ? ps : null;
  });
  private readonly resultsState = computed<StickerCollageResultsState | null>(() => {
    const ps = this.gameState()?.phaseState;
    return ps?.phase === "RESULTS" ? ps : null;
  });

  // ─── General state ───────────────────────────────────────────

  public readonly currentPrompt = computed(() => this.gameState()?.currentPrompt ?? "");
  public readonly currentTask = computed<MinigameTask | null>(() => this.gameState()?.currentTask ?? null);
  public readonly currentRecommendedPackIds = computed(() => this.gameState()?.currentRecommendedPackIds ?? []);
  public readonly currentRoundIndex = computed(() => this.gameState()?.currentRoundIndex ?? 0);
  public readonly phase = computed(() => this.gameState()?.phaseState.phase ?? "LOBBY");
  public readonly stickerCatalog = computed(() => this.gameState()?.stickerCatalog ?? []);
  public readonly votesPerPlayer = computed(() => this.gameState()?.votesPerPlayer ?? 3);
  public readonly maxStickersOnCanvas = computed(() => this.gameState()?.maxStickersOnCanvas ?? 12);

  // ─── Building phase ──────────────────────────────────────────

  public readonly hasSubmittedThisRound = computed<boolean>(() => {
    const playerId = this.sessionStore.playerId();
    const ms = this.gameState();
    if (!playerId || !ms) return false;
    const collages = (ms.submissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    const minigames = (ms.minigameSubmissions[ms.currentRoundIndex] ?? []).some(s => s.playerId === playerId);
    return collages || minigames;
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

  public readonly currentRoundSubmissions = computed<StickerCollage[]>(() => {
    const ms = this.gameState();
    if (!ms) return [];
    return ms.submissions[ms.currentRoundIndex] ?? [];
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

  public readonly promptChoices = computed(() => this.resultsState()?.promptChoices ?? []);
  public readonly packUnlockChoices = computed<StickerPack[]>(() => {
    const ms = this.gameState();
    const ps = this.resultsState();
    if (!ms || !ps) return [];
    return ps.packUnlockChoices.map(id => ms.stickerPacks.find(p => p.id === id)).filter((p): p is StickerPack => !!p);
  });
  public readonly winnerChoicesDone = computed(() => this.resultsState()?.winnerChoicesDone ?? false);
  public readonly hasChosenPrompt = computed(() => {
    const ms = this.gameState();
    return !!ms && !!ms.promptHistory[ms.currentRoundIndex + 1];
  });
  public readonly hasUnlockedPack = computed(() => !!(this.resultsState()?.lastUnlockedPackId));
  public readonly hasLockedPacks = computed(() => (this.resultsState()?.packUnlockChoices ?? []).length > 0);

  /** True once the winner has completed all choices — unlocks the "Weiter" button for everyone. */
  public readonly canReadyToAdvance = computed<boolean>(() => this.resultsState()?.winnerChoicesDone ?? true);

  // ─── Sticker packs (cross-phase) ─────────────────────────────

  public readonly stickerPacks = computed(() => this.gameState()?.stickerPacks ?? []);
  public readonly lastUnlockedPackId = computed(() => this.resultsState()?.lastUnlockedPackId ?? null);

  public readonly unlockedPackIds = computed<string[]>(() => this.gameState()?.unlockedPackIds ?? []);

  public readonly unlockedStickers = computed(() => {
    const state = this.gameState();
    if (!state) return [];
    const unlockedIds = new Set(state.unlockedPackIds);
    return state.stickerCatalog.filter(s => {
      if (!s.packId) return false;
      const pack = state.stickerPacks.find(p => p.id === s.packId);
      if (!pack) return false;
      return pack.unlockedAtStart || unlockedIds.has(s.packId);
    });
  });

  // ─── Actions ─────────────────────────────────────────────────

  public submitCollage(placements: StickerPlacement[]): void {
    this.sendAction({type: "submit-collage", placements});
  }

  public submitMinigame(action: MinigameClientAction): void {
    this.wsService.send({type: "game-action", action});
  }

  public skipRound(): void {
    this.sendAction({type: "skip-round"});
  }

  public castVote(collageId: string): void {
    this.sendAction({type: "cast-vote", collageId});
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

  public pickPrompt(prompt: string): void {
    this.sendAction({type: "pick-prompt", prompt});
  }

  public unlockPack(packId: string): void {
    this.sendAction({type: "unlock-pack", packId});
  }

  private sendAction(action: StickerCollageClientAction): void {
    this.wsService.send({type: "game-action", action});
  }
}
