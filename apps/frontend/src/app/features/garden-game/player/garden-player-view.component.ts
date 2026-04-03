import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import {GardenPlayerService} from '../services/garden-player.service';

@Component({
  selector: "app-garden-player-view",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./garden-player-view.component.html",
})
export class GardenPlayerViewComponent {
  public readonly garden = inject(GardenPlayerService);
}

