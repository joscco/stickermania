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

  /** The scene is circular, so we use the larger dimension to ensure all content fits */
  public readonly sceneSizePx = computed<number>(() => {
    return Math.max(this.sceneWidthPx(), this.sceneHeightPx());
  });

  /** Effective container pixel size */
  public readonly containerPx = computed<number>(() => {
    return this.sceneSizePx() * this.viewScale();
  });

  /** Scale factor applied to drawing sizes within the container */
  public readonly drawingScale = computed<number>(() => {
    // When scaleContainer is true, viewScale is baked into containerPx → drawings scale = 1
    // When scaleContainer is false, container is fixed → drawings need viewScale
    return 1;
  });

  public readonly drawingsSorted = computed<Drawing[]>(() => {
    const state = this.gameState();
    if (!state) return [];
    return Object.values(state.drawings).sort((a, b) => a.placedAt - b.placedAt);
  });
}
