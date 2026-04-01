import { Component, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { Point } from "../../player/types";
import { GraffitiPlayerService } from "./graffiti-player.service";
import { GameViewportComponent } from "../../shared/game-viewport.component";
import { TagHouseComponent } from "../shared/tag-house.component";

/** Hit-test constants (logical px matching the house sprite size) */
const HOUSE_HIT_W = 120;
const HOUSE_HIT_H = 160;

@Component({
  selector: "app-graffiti-player-view",
  standalone: true,
  imports: [CommonModule, GameViewportComponent, TagHouseComponent],
  template: `
    @if (!graffiti.currentTeamId()) {
      <!-- Team selection -->
      <div class="h-full flex flex-col items-center justify-center gap-6 p-6">
        <div class="text-lg font-bold text-stone-800">Wähle dein Team</div>
        <div class="flex gap-4">
          <button
            class="rounded-3xl bg-blue-500 text-white px-8 py-6 font-bold text-2xl shadow-lg active:scale-95 transition-transform"
            (click)="graffiti.assignTeam('DIAMOND')"
          >♦️ Karo</button>
          <button
            class="rounded-3xl bg-rose-500 text-white px-8 py-6 font-bold text-2xl shadow-lg active:scale-95 transition-transform"
            (click)="graffiti.assignTeam('HEART')"
          >♥️ Herz</button>
        </div>
      </div>
    } @else {
      <div class="h-full w-full relative">
        <!-- HUD: action budget -->
        <div class="absolute top-3 left-3 z-20 rounded-2xl bg-white/90 backdrop-blur shadow-lg px-3 py-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold">{{ graffiti.myActions() }}</span>
            <div class="flex gap-0.5">
              @for (i of actionDots(); track i) {
                <div class="w-2 h-2 rounded-full transition-colors"
                     [class.bg-blue-500]="graffiti.currentTeamId() === 'DIAMOND' && i < graffiti.myActions()"
                     [class.bg-rose-500]="graffiti.currentTeamId() === 'HEART' && i < graffiti.myActions()"
                     [class.bg-stone-200]="i >= graffiti.myActions()"></div>
              }
            </div>
          </div>
        </div>

        <!-- HUD: team badge -->
        <div class="absolute top-3 right-3 z-20 rounded-2xl bg-white/90 backdrop-blur shadow-lg px-3 py-2 text-lg">
          {{ graffiti.currentTeamId() === 'DIAMOND' ? '♦️' : '♥️' }}
        </div>

        <!-- City viewport -->
        <app-game-viewport
          class="block h-full w-full"
          [sceneWidth]="graffiti.sceneWidth()"
          [sceneHeight]="graffiti.sceneHeight()"
          (contentTap)="onContentTap($event)"
        >
          <div class="relative select-none"
               [style.width.px]="graffiti.sceneWidth()"
               [style.height.px]="graffiti.sceneHeight()">
            <!-- Subtle grid -->
            <div class="absolute inset-0 opacity-[0.04]"
                 style="background-image: radial-gradient(circle, #000 0.6px, transparent 0.6px); background-size: 40px 40px;"></div>

            @for (house of graffiti.houses(); track house.id) {
              <div class="absolute pointer-events-none"
                   [style.left.px]="house.x"
                   [style.top.px]="house.y"
                   style="transform: translate(-50%, -100%);">
                <app-tag-house [house]="house" [sizePx]="160" />
              </div>
            }
          </div>
        </app-game-viewport>
      </div>
    }
  `,
})
export class GraffitiPlayerViewComponent {
  public readonly graffiti = inject(GraffitiPlayerService);

  public readonly actionDots = computed(() =>
    Array.from({ length: this.graffiti.maxActions() }, (_, i) => i),
  );

  public onContentTap(point: Point): void {
    const houses = this.graffiti.houses();
    for (const house of houses) {
      const left = house.x - HOUSE_HIT_W / 2;
      const right = house.x + HOUSE_HIT_W / 2;
      const top = house.y - HOUSE_HIT_H;
      const bottom = house.y;
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
        this.graffiti.tapHouse(house);
        return;
      }
    }
  }
}

