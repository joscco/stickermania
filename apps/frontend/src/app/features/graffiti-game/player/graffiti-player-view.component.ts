import { Component, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { Point } from "../../player/types";
import { GameViewportComponent } from "../../player/viewport/game-viewport.component";
import { TagHouseComponent } from "../shared/tag-house.component";
import {GraffitiPlayerService} from '../services/graffiti-player.service';

/** Hit-test constants (logical px matching the house sprite size) */
const HOUSE_HIT_W = 120;
const HOUSE_HIT_H = 160;

@Component({
  selector: "app-graffiti-player-view",
  standalone: true,
  imports: [CommonModule, GameViewportComponent, TagHouseComponent],
  templateUrl: "./graffiti-player-view.component.html",
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

