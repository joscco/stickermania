import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { GardenPlayerService } from "./garden-player.service";

@Component({
  selector: "app-garden-player-view",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-full overflow-auto p-4 space-y-4">
      <div class="rounded-3xl bg-white border border-black/5 p-4 shadow-sm">
        <div class="text-xs uppercase tracking-wider text-emerald-600">Fortschritt</div>
        <div class="mt-1 text-2xl font-bold">Level {{ garden.modeState()?.level ?? 1 }}</div>
        <div class="text-sm text-stone-500">{{ garden.modeState()?.experiencePoints ?? 0 }} XP</div>
      </div>

      <div class="rounded-3xl bg-white border border-black/5 p-4 shadow-sm">
        <div class="text-sm font-semibold">Inventar</div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          @for (entry of garden.inventoryEntries(); track entry.plantId) {
            <div class="rounded-2xl bg-stone-50 px-3 py-2 text-sm">
              <div class="font-medium text-stone-800">{{ entry.name }}</div>
              <div class="text-xs text-stone-500">Samen: {{ entry.seeds }} · Ernte: {{ entry.harvestedGoods }}</div>
            </div>
          }
        </div>
      </div>

      <div class="space-y-3">
        @for (plot of garden.plots(); track plot.id) {
          <div class="rounded-3xl bg-white border border-black/5 p-4 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold">{{ plot.id }}</div>
                <div class="text-xs text-stone-500">{{ plot.status }} @if (plot.plantId) { · {{ garden.plantName(plot.plantId) }} }</div>
              </div>
              @if (plot.status === 'EMPTY') {
                <div class="flex flex-wrap gap-2 justify-end">
                  @for (plantId of garden.availablePlantIds(); track plantId) {
                    <button class="rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm" (click)="garden.plantSeed(plot.id, plantId)">{{ garden.plantName(plantId) }} pflanzen</button>
                  }
                </div>
              } @else if (plot.status === 'GROWING') {
                <button class="rounded-xl bg-blue-600 text-white px-3 py-2 text-sm" (click)="garden.waterPlant(plot.id)">Gießen</button>
              } @else if (plot.status === 'READY') {
                <button class="rounded-xl bg-amber-500 text-white px-3 py-2 text-sm" (click)="garden.harvestPlant(plot.id)">Ernten</button>
              } @else if (plot.status === 'PAUSED_BY_PEST') {
                <button class="rounded-xl bg-rose-500 text-white px-3 py-2 text-sm" (click)="garden.clearPest(plot.id)">Ungeziefer wegklicken</button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class GardenPlayerViewComponent {
  public readonly garden = inject(GardenPlayerService);
}

