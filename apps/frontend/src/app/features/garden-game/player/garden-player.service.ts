import { computed, inject, Injectable } from "@angular/core";
import type { GardenModeState } from "@birthday/shared";
import { WebSocketService } from "../../../core/websocket.service";
import { WorldStore } from "../../../core/world.store";

@Injectable()
export class GardenPlayerService {
  private readonly ws = inject(WebSocketService);
  private readonly worldStore = inject(WorldStore);

  public readonly modeState = computed<GardenModeState | null>(() => this.worldStore.gardenModeState());

  public readonly inventoryEntries = computed(() => {
    const state = this.modeState();
    if (!state) return [];
    return Object.values(state.inventory)
      .map((item) => ({
        plantId: item.plantId,
        seeds: item.seeds,
        harvestedGoods: item.harvestedGoods,
        name: state.plantDefinitions[item.plantId]?.name ?? item.plantId,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  public readonly plots = computed(() => {
    const state = this.modeState();
    return state ? Object.values(state.plots) : [];
  });

  public readonly availablePlantIds = computed<string[]>(() => this.modeState()?.unlockedPlantIds ?? []);

  public plantName(plantId: string | null): string {
    if (!plantId) return "";
    return this.modeState()?.plantDefinitions[plantId]?.name ?? plantId;
  }

  public plantSeed(plotId: string, plantId: string): void {
    this.ws.send({ type: "game-action", mode: "garden-coop", action: { type: "plant-seed", plotId, plantId } });
  }

  public waterPlant(plotId: string): void {
    this.ws.send({ type: "game-action", mode: "garden-coop", action: { type: "water-plant", plotId } });
  }

  public harvestPlant(plotId: string): void {
    this.ws.send({ type: "game-action", mode: "garden-coop", action: { type: "harvest-plant", plotId } });
  }

  public clearPest(plotId: string): void {
    this.ws.send({ type: "game-action", mode: "garden-coop", action: { type: "clear-pest", plotId } });
  }
}

