import { Component, computed, input } from "@angular/core";
import type { GameState, Drawing } from "@birthday/shared";

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  templateUrl: "./scene-renderer.component.html",
})
export class SceneRendererComponent {
  public readonly gameState = input.required<GameState | null>();
  public readonly sceneWidthPx = input<number>(1000);
  public readonly sceneHeightPx = input<number>(1000);
  public readonly viewScale = input<number>(1);

  /** The scene is circular — use the larger dimension to ensure all content fits. */
  public readonly sceneSizePx = computed(() =>
    Math.max(this.sceneWidthPx(), this.sceneHeightPx())
  );

  /** Effective pixel size of the outer container. */
  public readonly containerSizePx = computed(() =>
    this.sceneSizePx() * this.viewScale()
  );

  public readonly drawingsSorted = computed<Drawing[]>(() => {
    const state = this.gameState();
    if (!state) {
      return [];
    }
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });
}
