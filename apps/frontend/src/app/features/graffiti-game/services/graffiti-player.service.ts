import {computed, effect, inject, Injectable, signal} from "@angular/core";
import type {TeamGraffitiHouse, TeamGraffitiModeState, TeamGraffitiTeamId} from "@birthday/shared";
import {WebSocketService} from "../../../core/websocket.service";
import {WorldStore} from "../../../core/world.store";
import {GameSessionStore} from "../../../core/challenge.store";

@Injectable()
export class GraffitiPlayerService {
  private readonly ws = inject(WebSocketService);
  private readonly worldStore = inject(WorldStore);
  private readonly sessionStore = inject(GameSessionStore);

  /** Taps used locally but not yet confirmed by the server. */
  private readonly pendingTaps = signal(0);

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
    if (!state || !playerId) {
      return 0;
    }
    return state.playerActions[playerId]?.actions ?? 0;
  });

  /** Displayed actions: server value minus taps still in-flight. */
  public readonly myActions = computed<number>(() => {
    return Math.max(0, this.serverActions() - this.pendingTaps());
  });

  public readonly maxActions = computed<number>(() => {
    return this.modeState()?.maxActions ?? 5;
  });

  public readonly isRoundRunning = computed<boolean>(() => {
    const state = this.modeState();
    if (!state?.roundEndsAt) {
      return false;
    }
    return Date.now() < state.roundEndsAt;
  });

  constructor() {
    // Reset pending taps whenever the server sends a new action count
    effect(() => {
      this.serverActions(); // track dependency
      this.pendingTaps.set(0);
    });
  }

  public assignTeam(teamId: TeamGraffitiTeamId): void {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return;
    this.ws.send({type: "game-action", mode: "team-graffiti", action: {type: "assign-team", playerId, teamId}});
  }

  public tagHouse(houseId: string): void {
    this.ws.send({type: "game-action", mode: "team-graffiti", action: {type: "tag-house", houseId}});
  }

  public tapHouse(house: TeamGraffitiHouse): void {
    const teamId = this.currentTeamId();

    if (!teamId || !this.isRoundRunning() || this.myActions() <= 0) {
      // Can't tap if not on a team, round isn't running, or no actions left
      return;
    }

    if (house.owner === teamId) {
      // House is already owned by player's team, no need to tap
      return;
    }

    this.pendingTaps.update((v) => v + 1);
    this.tagHouse(house.id);
  }
}
