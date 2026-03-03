import { Component, computed, input } from "@angular/core";
import type { GameState, Drawing } from "@birthday/shared";

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  templateUrl: "./scene-renderer.component.html",
})
export class SceneRendererComponent {
  public readonly gameState = input.required<GameState | null>();

  /** Pixel size of the circular container on screen. */
  public readonly containerSizePx = input.required<number>();

  /** Pixel size of each drawing on screen. */
  public readonly imageSizePx = input.required<number>();

  public readonly drawingsSorted = computed<Drawing[]>(() => {
    const state = this.gameState();
    if (!state) {
      return [];
    }
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });
}
