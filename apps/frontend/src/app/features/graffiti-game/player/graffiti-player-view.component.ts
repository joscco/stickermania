import { Component, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { Point } from "../../player/types";
import { GameViewportComponent } from "../../player/viewport/game-viewport.component";
import {TAG_HOUSE_SIZE_PX, TagHouseComponent} from "../shared/tag-house.component";
import {GraffitiPlayerService} from '../services/graffiti-player.service';

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
      const left = house.x - TAG_HOUSE_SIZE_PX / 2;
      const right = house.x + TAG_HOUSE_SIZE_PX / 2;
      const top = house.y - TAG_HOUSE_SIZE_PX;
      const bottom = house.y;
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
        this.graffiti.tapHouse(house);
        return;
      }
    }
  }
}

