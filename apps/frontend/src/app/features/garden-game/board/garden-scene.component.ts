import { CommonModule } from "@angular/common";
import { Component, computed, inject } from "@angular/core";
import { WorldStore } from "../../../core/world.store";

@Component({
  selector: "app-garden-scene",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./garden-scene.component.html",
})
export class GardenSceneComponent {
  private readonly worldStore = inject(WorldStore);

  public readonly modeState = computed(() => this.worldStore.gardenModeState());

  public readonly plots = computed(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.plots);
  });

  public readonly level = computed(() => this.modeState()?.level ?? 1);
  public readonly xp = computed(() => this.modeState()?.experiencePoints ?? 0);

  public readonly inventoryEntries = computed(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.inventory).map((item) => ({
      ...item,
      name: state.plantDefinitions[item.plantId]?.name ?? item.plantId,
    }));
  });

  public readonly orders = computed(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.customerOrders);
  });

  public plantName(plantId: string | null): string {
    if (!plantId) return "";
    return this.modeState()?.plantDefinitions[plantId]?.name ?? plantId;
  }

  public plotStatusLabel(status: string): string {
    switch (status) {
      case "EMPTY": return "Leer";
      case "GROWING": return "Wächst…";
      case "READY": return "Erntereif!";
      case "PAUSED_BY_PEST": return "Ungeziefer!";
      default: return status;
    }
  }

  public plotStatusColor(status: string): string {
    switch (status) {
      case "EMPTY": return "bg-stone-100 text-stone-500";
      case "GROWING": return "bg-emerald-100 text-emerald-700";
      case "READY": return "bg-amber-100 text-amber-700";
      case "PAUSED_BY_PEST": return "bg-rose-100 text-rose-700";
      default: return "bg-stone-100 text-stone-500";
    }
  }
}

