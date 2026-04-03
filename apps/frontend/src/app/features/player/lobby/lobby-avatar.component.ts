import { Component, input, output, ViewChild } from "@angular/core";
import { DrawingCanvasComponent } from "../shared/paint-canvas/drawing-canvas.component";

@Component({
  selector: "app-lobby-avatar",
  standalone: true,
  imports: [DrawingCanvasComponent],
  templateUrl: './lobby-avatar.component.html',
})
export class LobbyAvatarComponent {
  public readonly playerName = input.required<string>();
  public readonly avatarSubmitted = output<string>();
  public readonly skipped = output<void>();

  @ViewChild("drawingCanvas") drawingCanvas!: DrawingCanvasComponent;

  public clear(): void {
    this.drawingCanvas.clear();
  }

  public submit(): void {
    this.drawingCanvas.submit();
  }
}
