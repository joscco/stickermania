import { Component, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { DrawSearchCaptionTask } from "@birthday/shared";
import { FramedDrawingComponent } from "../../shared/framed-drawing.component";
import { OnScreenKeyboardComponent } from "../../../player/shared/on-screen-keyboard.component";

@Component({
  selector: "app-caption",
  standalone: true,
  imports: [CommonModule, FramedDrawingComponent, OnScreenKeyboardComponent],
  templateUrl: "./caption.component.html",
})
export class CaptionComponent {
  public readonly task = input.required<DrawSearchCaptionTask>();
  public readonly captionSubmitted = output<{ drawingId: string; text: string }>();

  public readonly captionText = signal("");

  public submit(): void {
    const text = this.captionText().trim();
    if (text.length === 0) return;
    this.captionSubmitted.emit({ drawingId: this.task().drawingId, text });
    this.captionText.set("");
  }
}

