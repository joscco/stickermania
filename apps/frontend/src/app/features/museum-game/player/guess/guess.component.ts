import { Component, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { DrawSearchGuessTask } from "@birthday/shared";
import { FramedDrawingComponent } from "../../shared/framed-drawing.component";

@Component({
  selector: "app-guess",
  standalone: true,
  imports: [CommonModule, FramedDrawingComponent],
  templateUrl: "./guess.component.html",
})
export class GuessComponent {
  public readonly task = input.required<DrawSearchGuessTask>();
  public readonly guessSubmitted = output<{ drawingId: string; captionId: string }>();

  public readonly selectedCaptionId = signal<string | null>(null);
  public readonly wasCorrectGuess = signal<boolean>(false);

  public selectCaption(captionId: string): void {
    if (this.selectedCaptionId()) return;
    this.selectedCaptionId.set(captionId);
    this.guessSubmitted.emit({ drawingId: this.task().drawingId, captionId });
  }

  /** Called by parent to reset state when a new task arrives. */
  public reset(): void {
    this.selectedCaptionId.set(null);
    this.wasCorrectGuess.set(false);
  }
}
