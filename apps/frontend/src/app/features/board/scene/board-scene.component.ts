import {Component, computed, effect, inject, signal,} from "@angular/core";
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

  // How big is the game field?
  private static readonly MIN_FIELD_WIDTH_IN_PX = 400;
  private static readonly MAX_FIELD_SIZE_IN_PX = 2000;
  private static readonly IMAGE_SIZE_IN_PX = 400;

  // How big is the final rendered circle on screen?
  private static readonly MIN_EFFECTIVE_FIELD_WIDTH_IN_PERCENT = 300;
  private static readonly MAX_EFFECTIVE_FIELD_WIDTH_IN_PERCENT = 600;

  public readonly fieldWidthPixel = signal<number>(BoardSceneComponent.MIN_FIELD_WIDTH_IN_PX);
  public readonly effectiveFieldWidthPixel = signal<number>(BoardSceneComponent.MIN_EFFECTIVE_FIELD_WIDTH_IN_PERCENT);
  public readonly imageSizeInPixel = computed(() => BoardSceneComponent.IMAGE_SIZE_IN_PX * this.effectiveFieldWidthPixel() / this.fieldWidthPixel() );

  public readonly drawingCount = computed(() =>
    Object.keys(this.store.gameState()?.drawings ?? {}).length,
  );

  constructor() {
    effect(() => {
      this.drawingCount();
      this.recomputeSize();
    });
  }

  public recomputeSize(): void {
    const count = this.drawingCount();

    // Map count between 0 and 1 with diminishing returns, then scale to the desired range.
    const t = 1 - Math.exp(-count / 10);
    const fieldWidth = BoardSceneComponent.MIN_FIELD_WIDTH_IN_PX + t * (BoardSceneComponent.MAX_FIELD_SIZE_IN_PX - BoardSceneComponent.MIN_FIELD_WIDTH_IN_PX);
    this.fieldWidthPixel.set(fieldWidth);
    const effectivePercent = BoardSceneComponent.MIN_EFFECTIVE_FIELD_WIDTH_IN_PERCENT + t * (BoardSceneComponent.MAX_EFFECTIVE_FIELD_WIDTH_IN_PERCENT - BoardSceneComponent.MIN_EFFECTIVE_FIELD_WIDTH_IN_PERCENT);
    this.effectiveFieldWidthPixel.set(effectivePercent);
  }
}

