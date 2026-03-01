import { Component, computed, input } from "@angular/core";
import type { GameState, Drawing } from "@birthday/shared";

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  templateUrl: "./scene-renderer.component.html"
})
export class SceneRendererComponent {
  public readonly gameState = input.required<GameState | null>();
  public readonly sceneWidthPx = input<number>(1600);
  public readonly sceneHeightPx = input<number>(900);
  public readonly viewScale = input<number>(1);

  public readonly drawingsSorted = computed<Drawing[]>(() => {
    const state = this.gameState();
    if (!state) return [];
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });
}
