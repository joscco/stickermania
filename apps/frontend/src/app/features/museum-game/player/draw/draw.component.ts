import { Component, input, output, ViewChild } from "@angular/core";
import { DrawingCanvasComponent } from "../../../player/shared/paint-canvas/drawing-canvas.component";

@Component({
  selector: "app-draw",
  standalone: true,
  imports: [DrawingCanvasComponent],
  templateUrl: './draw.component.html',
})
export class DrawComponent {
  public readonly prompt = input.required<string>();
  public readonly drawIndex = input.required<number>();
  public readonly drawTotal = input.required<number>();
  public readonly timeLeft = input<string>("");

  public readonly drawingSubmitted = output<string>();

  @ViewChild("drawingCanvas") drawingCanvas!: DrawingCanvasComponent;

  public clear(): void {
    this.drawingCanvas.clear();
  }

  public submit(): void {
    this.drawingCanvas.submit();
  }
}

