import { CommonModule } from "@angular/common";
import { Component, computed, inject } from "@angular/core";
import { WorldStore } from "../../../core/world.store";
import { SceneRendererComponent } from "../../../shared/scene-renderer/scene-renderer.component";

@Component({
  selector: "app-board-scene",
  standalone: true,
  imports: [CommonModule, SceneRendererComponent],
  templateUrl: "./board-scene.component.html",
})
export class BoardSceneComponent {
  public readonly worldStore = inject(WorldStore);

  private static readonly MIN_SCENE_WIDTH_PX = 500;
  private static readonly MAX_SCENE_WIDTH_PX = 1200;
  private static readonly MIN_SCENE_HEIGHT_PX = 360;
  private static readonly MAX_SCENE_HEIGHT_PX = 800;

  public readonly modeState = computed(() => this.worldStore.drawSearchModeState());

  public readonly logicalFieldWidth = computed(() => this.modeState()?.effectiveFieldWidth ?? this.worldStore.fieldBaseSize());
  public readonly logicalFieldHeight = computed(() => this.modeState()?.effectiveFieldHeight ?? this.worldStore.fieldBaseSize());

  public readonly displayFieldWidth = computed(() => {
    const logicalFieldWidth = this.logicalFieldWidth();
    const baseFieldSize = this.worldStore.fieldBaseSize();
    const maxFieldSize = this.worldStore.fieldMaxSize();
    const interpolation = Math.min(1, Math.max(0, (logicalFieldWidth - baseFieldSize) / Math.max(1, maxFieldSize - baseFieldSize)));

    return BoardSceneComponent.MIN_SCENE_WIDTH_PX + interpolation * (BoardSceneComponent.MAX_SCENE_WIDTH_PX - BoardSceneComponent.MIN_SCENE_WIDTH_PX);
  });

  public readonly displayFieldHeight = computed(() => {
    const logicalFieldHeight = this.logicalFieldHeight();
    const baseFieldSize = this.worldStore.fieldBaseSize();
    const maxFieldSize = this.worldStore.fieldMaxSize();
    const interpolation = Math.min(1, Math.max(0, (logicalFieldHeight - baseFieldSize) / Math.max(1, maxFieldSize - baseFieldSize)));

    return BoardSceneComponent.MIN_SCENE_HEIGHT_PX + interpolation * (BoardSceneComponent.MAX_SCENE_HEIGHT_PX - BoardSceneComponent.MIN_SCENE_HEIGHT_PX);
  });

  public readonly imageSizeInPixel = computed(() => {
    const logicalFieldWidth = this.logicalFieldWidth();

    if (logicalFieldWidth <= 0) {
      return this.worldStore.imageSizePx();
    }

    return this.worldStore.imageSizePx() * this.displayFieldWidth() / logicalFieldWidth;
  });

  public readonly drawingCount = computed(() => Object.keys(this.modeState()?.drawings ?? {}).length);
}
