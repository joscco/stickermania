import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../core/world.store";
import {SceneRendererComponent} from "../../../shared/scene-renderer/scene-renderer.component";

@Component({
  selector: "app-board-scene",
  standalone: true,
  imports: [CommonModule, SceneRendererComponent],
  templateUrl: "./board-scene.component.html",
})
export class BoardSceneComponent {
  public readonly store = inject(WorldStore);

  /** On-screen circle diameter range in CSS pixels (display-only, not from config) */
  private static readonly MIN_CIRCLE_PX = 400;
  private static readonly MAX_CIRCLE_PX = 700;

  /** Logical field size in px – read directly from the backend game state. */
  public readonly fieldWidthPixel = computed(() =>
    this.store.gameState()?.effectiveFieldWidth ?? this.store.fieldBaseSize(),
  );

  /** Map the logical field size to an on-screen circle diameter. */
  public readonly effectiveFieldWidthPixel = computed(() => {
    const efw = this.fieldWidthPixel();
    const baseSize = this.store.fieldBaseSize();
    const maxSize = this.store.fieldMaxSize();
    const t = Math.min(1, Math.max(0,
      (efw - baseSize) / (maxSize - baseSize),
    ));
    return BoardSceneComponent.MIN_CIRCLE_PX +
      t * (BoardSceneComponent.MAX_CIRCLE_PX - BoardSceneComponent.MIN_CIRCLE_PX);
  });

  /** Image size on screen = imageSizePx scaled by the ratio (screen circle / logical field). */
  public readonly imageSizeInPixel = computed(() =>
    this.store.imageSizePx() * this.effectiveFieldWidthPixel() / this.fieldWidthPixel(),
  );

  public readonly drawingCount = computed(() =>
    Object.keys(this.store.gameState()?.drawings ?? {}).length,
  );
}

