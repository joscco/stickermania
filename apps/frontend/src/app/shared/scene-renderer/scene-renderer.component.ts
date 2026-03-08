import { Component, computed, input } from "@angular/core";
import type { DrawSearchDrawing, DrawSearchModeState } from "@birthday/shared";

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  templateUrl: "./scene-renderer.component.html",
})
export class SceneRendererComponent {
  public readonly modeState = input.required<DrawSearchModeState | null>();
  public readonly containerWidthPx = input.required<number>();
  public readonly containerHeightPx = input.required<number>();
  public readonly imageSizePx = input.required<number>();

  public readonly drawingsSorted = computed<DrawSearchDrawing[]>(() => {
    const modeState = this.modeState();

    if (!modeState) {
      return [];
    }

    return Object.values(modeState.drawings).sort((leftDrawing, rightDrawing) => leftDrawing.placedAt - rightDrawing.placedAt);
  });
}
