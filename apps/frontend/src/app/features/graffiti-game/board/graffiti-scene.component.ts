import { CommonModule } from "@angular/common";
import { Component, computed, inject } from "@angular/core";
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

  public readonly buildings = computed(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.buildings);
  });

  public readonly activeTags = computed(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.activeTags);
  });

  public readonly redScore = computed(() => this.modeState()?.teams["RED"]?.score ?? 0);
  public readonly blueScore = computed(() => this.modeState()?.teams["BLUE"]?.score ?? 0);

  public readonly timeLeft = computed(() => {
    const state = this.modeState();
    if (!state?.roundEndsAt) return "";
    const ms = Math.max(0, state.roundEndsAt - Date.now());
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  });

  public tagsOnBuilding(buildingId: string): number {
    return this.activeTags().filter((t) => t.buildingId === buildingId).length;
  }

  public dominantTeam(buildingId: string): string | null {
    const tags = this.activeTags().filter((t) => t.buildingId === buildingId);
    const red = tags.filter((t) => t.teamId === "RED").length;
    const blue = tags.filter((t) => t.teamId === "BLUE").length;
    if (red === blue) return null;
    return red > blue ? "RED" : "BLUE";
  }
}

