import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";
import { OBJECT_TYPES, type ObjectType, type StickerPlacement, type WorldState } from "@birthday/shared";

@Component({
  selector: "app-scene-renderer",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./scene-renderer.component.html"
})
export class SceneRendererComponent {
  @Input({ required: true })
  public world: WorldState | null = null;

  @Input()
  public sceneWidthPx: number = 1000;

  @Input()
  public sceneHeightPx: number = 700;

  @Input()
  public viewScale: number = 1;

  @Input()
  public baseStickerSizePx: number = 40;

  @Input()
  public baseFontSizePx: number = 18;

  public placementsSorted(): StickerPlacement[] {
    if (!this.world) {
      return [];
    }
    return Object.values(this.world.placements).sort((a, b) => a.zIndex - b.zIndex);
  }

  public emojiForType(objectType: ObjectType): string {
    const found = OBJECT_TYPES.find((entry) => entry.type === objectType);
    return found?.emoji ?? "❓";
  }
}
