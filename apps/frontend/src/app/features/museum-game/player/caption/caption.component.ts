import { Component, inject, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { DrawSearchCaptionTask } from "@birthday/shared";
import { FramedDrawingComponent } from "../../shared/framed-drawing.component";
import { OnScreenKeyboardComponent } from "../../../player/shared/keyboard/on-screen-keyboard.component";
import { GameSessionStore } from "../../../../core/challenge.store";

@Component({
  selector: "app-caption",
  standalone: true,
  imports: [CommonModule, FramedDrawingComponent, OnScreenKeyboardComponent],
  templateUrl: "./caption.component.html",
})
export class CaptionComponent {
  private readonly sessionStore = inject(GameSessionStore);

  public readonly task = input.required<DrawSearchCaptionTask>();
  public readonly captionSubmitted = output<{ drawingId: string; text: string }>();

  public readonly captionText = signal("");
  public readonly isSubmitting = signal(false);

  /** Re-enable input when a rejection feedback arrives */
  public readonly feedback = this.sessionStore.feedback;

  public submit(): void {
    const text = this.captionText().trim();
    if (text.length === 0 || this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.captionSubmitted.emit({ drawingId: this.task().drawingId, text });

    // Re-enable after a short timeout so the server response can unlock us.
    // If the caption is accepted, the whole component gets replaced by the next task.
    // If rejected, the feedback event arrives and we re-enable editing.
    setTimeout(() => this.isSubmitting.set(false), 1500);
  }
}

