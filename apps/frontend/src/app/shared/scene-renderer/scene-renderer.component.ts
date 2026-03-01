import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import type { GameState, Drawing } from "@birthday/shared";

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./scene-renderer.component.html"
})
export class SceneRendererComponent {
  @Input({ required: true })
  public gameState: GameState | null = null;

  @Input()
  public sceneWidthPx: number = 1600;

  @Input()
  public sceneHeightPx: number = 900;

  @Input()
  public viewScale: number = 1;

  @Input()
  public highlightDrawingId: string | null = null;

  @Input()
  public onDrawingTapped: ((drawingId: string) => void) | null = null;

  public drawingsSorted(): Drawing[] {
    if (!this.gameState) {
      return [];
    }
    return Object.values(this.gameState.drawings).sort((a, b) => a.placedAt - b.placedAt);
  }

  public handleDrawingClick(drawingId: string): void {
    if (this.onDrawingTapped) {
      this.onDrawingTapped(drawingId);
    }
  }
}
