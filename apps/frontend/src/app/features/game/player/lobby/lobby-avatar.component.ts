import { Component, input, output, ViewChild } from "@angular/core";
import { DrawingCanvasComponent } from '../../../shared/paint-canvas/drawing-canvas.component';
import {AnimOnInitDirective, AnimGroupDirective} from '../../../shared/animations/anim-on-init.directive';

@Component({
  selector: "app-lobby-avatar",
  standalone: true,
  imports: [DrawingCanvasComponent, AnimOnInitDirective, AnimGroupDirective],
  templateUrl: './lobby-avatar.component.html',
  host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class LobbyAvatarComponent {
  public readonly playerName = input.required<string>();
  public readonly initialAvatarImage = input<string | null>(null);
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
