import {computed, DestroyRef, effect, inject, Injectable, signal} from "@angular/core";
import type {TeamGraffitiHouse, TeamGraffitiModeState, TeamGraffitiTeamId} from "@birthday/shared";
import {WebSocketService} from "../../../core/websocket.service";
import {WorldStore} from "../../../core/world.store";
import {GameSessionStore} from "../../../core/challenge.store";

@Injectable()
export class GraffitiPlayerService {
  private readonly ws = inject(WebSocketService);
  private readonly worldStore = inject(WorldStore);
  private readonly sessionStore = inject(GameSessionStore);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Optimistic action offset — decremented on tap, reset to 0 whenever
   * the server pushes an updated session-state (which includes the real
   * action count).
   */
  private readonly optimisticSpent = signal(0);

  /** Track the server revision so we can reset optimistic state on each update. */
  private lastSeenRevision = -1;

  /** Client-side accrual timer handle. */
  private accrualInterval: ReturnType<typeof setInterval> | null = null;
  /** Extra actions predicted by client-side accrual (reset on server update). */
  private readonly predictedAccrual = signal(0);

  public readonly modeState = computed<TeamGraffitiModeState | null>(() => this.worldStore.teamGraffitiModeState());

  public readonly currentTeamId = computed<TeamGraffitiTeamId | null>(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return null;
    const teamId = this.worldStore.players()[playerId]?.teamId ?? null;
    return teamId as TeamGraffitiTeamId | null;
  });

  public readonly houses = computed<TeamGraffitiHouse[]>(() => {
    const state = this.modeState();
    return state ? Object.values(state.houses) : [];
  });

  public readonly sceneWidth = computed<number>(() => this.modeState()?.sceneWidth ?? 2000);
  public readonly sceneHeight = computed<number>(() => this.modeState()?.sceneHeight ?? 1400);

  /** Server-reported action count for this player. */
  private readonly serverActions = computed<number>(() => {
    const state = this.modeState();
    const playerId = this.sessionStore.playerId();
    if (!state || !playerId) return 0;
    return state.playerActions[playerId]?.actions ?? 0;
  });

  /**
   * Displayed action count: server value − optimistic spent + predicted accrual,
   * clamped to [0, maxActions].
   */
  public readonly myActions = computed<number>(() => {
    const base = this.serverActions() - this.optimisticSpent() + this.predictedAccrual();
    return Math.max(0, Math.min(base, this.maxActions()));
  });

  public readonly maxActions = computed<number>(() => {
    return this.modeState()?.maxActions ?? 5;
  });

  public readonly isRoundRunning = computed<boolean>(() => {
    const state = this.modeState();
    if (!state?.roundEndsAt) return false;
    return Date.now() < state.roundEndsAt;
  });

  constructor() {
    // Reset optimistic state whenever the server pushes a new revision
    effect(() => {
      const state = this.worldStore.sessionState();
      if (!state) return;
      if (state.revision !== this.lastSeenRevision) {
        this.lastSeenRevision = state.revision;
        this.optimisticSpent.set(0);
        this.predictedAccrual.set(0);
      }
    });

    // Start/stop client-side accrual prediction timer when round state changes
    effect(() => {
      const state = this.modeState();
      this.stopAccrualTimer();
      if (!state?.roundStartedAt || !state?.roundEndsAt) return;
      if (Date.now() >= state.roundEndsAt) return;

      const intervalMs = state.actionAccrualIntervalSec * 1000;
      if (intervalMs <= 0) return;

      this.accrualInterval = setInterval(() => {
        const ms = this.modeState();
        if (!ms?.roundEndsAt || Date.now() >= ms.roundEndsAt) {
          this.stopAccrualTimer();
          return;
        }
        // Only predict if the displayed count is below max
        if (this.myActions() < this.maxActions()) {
          this.predictedAccrual.update((v) => v + 1);
        }
      }, intervalMs);
    });

    this.destroyRef.onDestroy(() => this.stopAccrualTimer());
  }

  public assignTeam(teamId: TeamGraffitiTeamId): void {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return;
    this.ws.send({type: "game-action", mode: "team-graffiti", action: {type: "assign-team", playerId, teamId}});
  }

  public tagHouse(houseId: string): void {
    this.ws.send({type: "game-action", mode: "team-graffiti", action: {type: "tag-house", houseId}});
  }

  /**
   * Tap action: tag neutral or opponent houses, ignore own.
   * Immediately deducts an optimistic action so the UI feels instant.
   */
  public tapHouse(house: TeamGraffitiHouse): void {
    const teamId = this.currentTeamId();
    if (!teamId || !this.isRoundRunning() || this.myActions() <= 0) return;

    if (house.owner === teamId) {
      // Own house — nothing to do
      return;
    }

    // Optimistic deduction — the server will confirm via session-state push
    this.optimisticSpent.update((v) => v + 1);
    this.tagHouse(house.id);
  }

  private stopAccrualTimer(): void {
    if (this.accrualInterval) {
      clearInterval(this.accrualInterval);
      this.accrualInterval = null;
    }
  }
}
