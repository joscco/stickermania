import { Component, computed, inject, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { DrawSearchGuessTask } from "@birthday/shared";
import { FramedDrawingComponent } from "../../shared/framed-drawing.component";
import { GameSessionStore } from "../../../../core/challenge.store";

@Component({
  selector: "app-guess",
  standalone: true,
  imports: [CommonModule, FramedDrawingComponent],
  templateUrl: "./guess.component.html",
})
export class GuessComponent {
  private readonly sessionStore = inject(GameSessionStore);

  public readonly task = input.required<DrawSearchGuessTask>();
  public readonly guessSubmitted = output<{ drawingId: string; captionId: string }>();

  public readonly selectedCaptionId = signal<string | null>(null);

  /** Read guess result from the store (set by event handler) */
  public readonly guessResult = computed(() => {
    const result = this.sessionStore.guessResult();
    if (result && result.drawingId === this.task().drawingId) {
      return result;
    }
    return null;
  });

  public readonly wasCorrectGuess = computed(() => this.guessResult()?.correct ?? false);
  public readonly hasResult = computed(() => !!this.guessResult());

  public selectCaption(captionId: string): void {
    if (this.selectedCaptionId()) return;
    this.selectedCaptionId.set(captionId);
    this.guessSubmitted.emit({ drawingId: this.task().drawingId, captionId });
  }

  /** Dismiss the result overlay and proceed to the next task */
  public continueToNext(): void {
    this.sessionStore.dismissGuessResult();
  }

  /** Called by parent to reset state when a new task arrives. */
  public reset(): void {
    this.selectedCaptionId.set(null);
  }
}
