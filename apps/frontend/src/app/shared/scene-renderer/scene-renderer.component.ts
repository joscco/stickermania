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

  /**
   * If true (default), viewScale resizes the entire container (used by search viewport).
   * If false, the container stays at sceneSizePx and viewScale only shrinks the drawings (used by board).
   */
  public readonly scaleContainer = input<boolean>(true);

  /** The scene is circular — use the larger dimension to ensure all content fits. */
  public readonly sceneSizePx = computed(() =>
    Math.max(this.sceneWidthPx(), this.sceneHeightPx())
  );

  /** Effective pixel size of the outer container. */
  public readonly containerSizePx = computed(() =>
    this.scaleContainer()
      ? this.sceneSizePx() * this.viewScale()
      : this.sceneSizePx()
  );

  /**
   * Scale factor applied to drawing dimensions within the container.
   * - scaleContainer=true  → viewScale is already in containerSizePx, so drawings scale at 1×.
   * - scaleContainer=false → container is fixed, so viewScale shrinks the drawings.
   */
  public readonly drawingScale = computed(() =>
    this.scaleContainer() ? 1 : this.viewScale()
  );

  public readonly drawingsSorted = computed<Drawing[]>(() => {
    const state = this.gameState();
    if (!state) {
      return [];
    }
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });
}
