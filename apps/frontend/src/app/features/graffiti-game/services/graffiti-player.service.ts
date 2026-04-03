import { computed, inject, Injectable } from "@angular/core";
import type { TeamGraffitiModeState, TeamGraffitiTeamId, TeamGraffitiHouse } from "@birthday/shared";
import { WebSocketService } from "../../../core/websocket.service";
import { WorldStore } from "../../../core/world.store";
import { GameSessionStore } from "../../../core/challenge.store";

@Injectable()
export class GraffitiPlayerService {
  private readonly ws = inject(WebSocketService);
  private readonly worldStore = inject(WorldStore);
  private readonly sessionStore = inject(GameSessionStore);

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

  public readonly myActions = computed<number>(() => {
    const state = this.modeState();
    const playerId = this.sessionStore.playerId();
    if (!state || !playerId) return 0;
    return state.playerActions[playerId]?.actions ?? 0;
  });

  public readonly maxActions = computed<number>(() => {
    return this.modeState()?.maxActions ?? 5;
  });

  public readonly isRoundRunning = computed<boolean>(() => {
    const state = this.modeState();
    if (!state?.roundEndsAt) return false;
    return Date.now() < state.roundEndsAt;
  });

  /**
   * Determine what action to take when a house is tapped.
   * - Neutral or opponent house → tag it
   * - Own team's house → no action
   * - Opponent house when wiping is desired → wipe it (handled separately)
   */
  public canTagHouse(house: TeamGraffitiHouse): boolean {
    const teamId = this.currentTeamId();
    if (!teamId || !this.isRoundRunning() || this.myActions() <= 0) return false;
    return house.owner !== teamId;
  }

  public canWipeHouse(house: TeamGraffitiHouse): boolean {
    const teamId = this.currentTeamId();
    if (!teamId || !this.isRoundRunning() || this.myActions() <= 0) return false;
    return house.owner !== null && house.owner !== teamId;
  }

  public assignTeam(teamId: TeamGraffitiTeamId): void {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return;
    this.ws.send({ type: "game-action", mode: "team-graffiti", action: { type: "assign-team", playerId, teamId } });
  }

  public tagHouse(houseId: string): void {
    this.ws.send({ type: "game-action", mode: "team-graffiti", action: { type: "tag-house", houseId } });
  }

  public wipeHouse(houseId: string): void {
    this.ws.send({ type: "game-action", mode: "team-graffiti", action: { type: "wipe-house", houseId } });
  }

  /**
   * Smart tap action: if opponent owns it → wipe, if neutral → tag, if own team → nothing
   */
  public tapHouse(house: TeamGraffitiHouse): void {
    const teamId = this.currentTeamId();
    if (!teamId || !this.isRoundRunning() || this.myActions() <= 0) return;

    if (house.owner === teamId) {
      // Own house — nothing to do
      return;
    }

    if (house.owner === null) {
      // Neutral house — tag it
      this.tagHouse(house.id);
    } else {
      // Opponent house — tag over it (claims it for your team)
      this.tagHouse(house.id);
    }
  }

  /**
   * Returns the PNG path for a house based on its type and owner.
   */
  public houseImageUrl(house: TeamGraffitiHouse): string {
    const typeKey = house.houseType.toLowerCase();
    if (!house.owner) {
      return `assets/png/tag_house_${typeKey}_default.png`;
    }
    const teamKey = house.owner === "DIAMOND" ? "diamond" : "heart";
    return `assets/png/tag_house_${typeKey}_${teamKey}_${house.tagVariant}.png`;
  }
}
