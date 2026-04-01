import { CommonModule } from "@angular/common";
import { Component, computed, inject } from "@angular/core";
import type { TeamGraffitiHouse } from "@birthday/shared";
import { WorldStore } from "../../../core/world.store";

@Component({
  selector: "app-graffiti-scene",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./graffiti-scene.component.html",
})
export class GraffitiSceneComponent {
  private readonly worldStore = inject(WorldStore);

  public readonly modeState = computed(() => this.worldStore.teamGraffitiModeState());

  public readonly houses = computed<TeamGraffitiHouse[]>(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.houses);
  });

  public readonly sceneWidth = computed(() => this.modeState()?.sceneWidth ?? 2000);
  public readonly sceneHeight = computed(() => this.modeState()?.sceneHeight ?? 1400);

  public readonly diamondScore = computed(() => this.modeState()?.teams["DIAMOND"]?.score ?? 0);
  public readonly heartScore = computed(() => this.modeState()?.teams["HEART"]?.score ?? 0);

  public readonly diamondHouseCount = computed(() =>
    this.houses().filter((h: TeamGraffitiHouse) => h.owner === "DIAMOND").length,
  );
  public readonly heartHouseCount = computed(() =>
    this.houses().filter((h: TeamGraffitiHouse) => h.owner === "HEART").length,
  );

  public readonly timeLeft = computed(() => {
    const state = this.modeState();
    if (!state?.roundEndsAt) return "";
    const ms = Math.max(0, state.roundEndsAt - Date.now());
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  });

  public houseImageUrl(house: TeamGraffitiHouse): string {
    const typeKey = house.houseType.toLowerCase();
    if (!house.owner) {
      return `assets/png/tag_house_${typeKey}_default.png`;
    }
    const teamKey = house.owner === "DIAMOND" ? "diamond" : "heart";
    return `assets/png/tag_house_${typeKey}_${teamKey}_${house.tagVariant}.png`;
  }
}
