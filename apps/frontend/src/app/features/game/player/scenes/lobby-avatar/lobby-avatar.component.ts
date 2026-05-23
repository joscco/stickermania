import {Component, inject, input, output, signal, ViewChild} from "@angular/core";
import {SvgComponent} from '../../../../shared/svg/svg.component';
import {AnimGroupDirective, AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import {AudioService} from '../../../../../core/audio.service';
import {DrawingCanvasComponent} from '../../../../shared/paint-canvas/drawing-canvas.component';


@Component({
  selector: "app-lobby-avatar",
  standalone: true,
  imports: [DrawingCanvasComponent, AnimOnInitDirective, AnimGroupDirective, SvgComponent, SvgComponent, AnimOnInitDirective],
  templateUrl: './lobby-avatar.component.html',
  host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class LobbyAvatarComponent {
  public readonly playerName = input.required<string>();
  public readonly initialAvatarImage = input<string | null>(null);
  public readonly avatarSubmitted = output<string>();

  public drawMode = signal<"big" | "small" | "erase">("big");

  public readonly audio = inject(AudioService);

  @ViewChild("drawingCanvas") drawingCanvas!: DrawingCanvasComponent;

  public clear(): void {
    this.audio.playClick();
    this.drawingCanvas.clear();
  }

  public submit(): void {
    this.audio.playClick();
    this.drawingCanvas.submit();
  }

  protected selectThinBrush() {
    this.audio.playClick();
    this.drawMode.set("small");
  }

  protected selectThickBrush() {
    this.audio.playClick();
    this.drawMode.set("big");
  }

  protected selectEraser() {
    this.audio.playClick();
    this.drawMode.set("erase");
  }
}
