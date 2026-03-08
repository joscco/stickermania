import { computed, inject, Injectable } from "@angular/core";
import type { TeamGraffitiModeState } from "@birthday/shared";
import { WebSocketService } from "../../../core/websocket.service";
import { WorldStore } from "../../../core/world.store";
import { GameSessionStore } from "../../../core/challenge.store";

@Injectable()
export class GraffitiPlayerService {
  private readonly ws = inject(WebSocketService);
  private readonly worldStore = inject(WorldStore);
  private readonly sessionStore = inject(GameSessionStore);

  public readonly modeState = computed<TeamGraffitiModeState | null>(() => this.worldStore.teamGraffitiModeState());

  public readonly currentTeamId = computed(() => {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return null;
    return this.worldStore.players()[playerId]?.teamId ?? null;
  });

  public readonly buildings = computed(() => {
    const state = this.modeState();
    return state ? Object.values(state.buildings) : [];
  });

  public readonly availableTagsToWipe = computed(() => {
    const state = this.modeState();
    const teamId = this.currentTeamId();
    if (!state || !teamId) return [];
    return Object.values(state.activeTags).filter((tag) => tag.teamId !== teamId);
  });

  public tagsOnBuilding(buildingId: string): TeamGraffitiModeState["activeTags"][string][] {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.activeTags).filter((tag) => tag.buildingId === buildingId);
  }

  public assignTeam(teamId: "RED" | "BLUE"): void {
    const playerId = this.sessionStore.playerId();
    if (!playerId) return;
    this.ws.send({ type: "game-action", mode: "team-graffiti", action: { type: "assign-team", playerId, teamId } });
  }

  public placeTag(buildingId: string): void {
    this.ws.send({ type: "game-action", mode: "team-graffiti", action: { type: "place-tag", buildingId } });
  }

  public wipeTag(tagId: string): void {
    this.ws.send({ type: "game-action", mode: "team-graffiti", action: { type: "wipe-tag", tagId, progressDelta: 35 } });
  }
}

