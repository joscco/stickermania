import {
  Component, ElementRef, ViewChild, AfterViewInit,
  input, output, signal,
} from "@angular/core";
import { CanvasPainter } from "../shared/canvas-painter";

@Component({
  selector: "app-lobby-avatar",
  standalone: true,
  templateUrl: './lobby-avatar.component.html',
})
export class LobbyAvatarComponent implements AfterViewInit {
  public readonly playerName = input.required<string>();

  public readonly avatarSubmitted = output<string>();
  public readonly skipped = output<void>();

  @ViewChild("canvas") canvasRef!: ElementRef<HTMLCanvasElement>;

  public readonly brushThin = signal(true);
  public readonly eraserMode = signal(false);

  public readonly painter = new CanvasPainter(
    () => this.canvasRef?.nativeElement,
    () => this.eraserMode() ? '#ffffff' : '#000000',
    () => this.eraserMode() ? 20 : this.brushThin() ? 3 : 10,
  );

  public ngAfterViewInit(): void {
    setTimeout(() => this.painter.init(), 50);
  }


  public selectBrush(thin: boolean): void {
    this.brushThin.set(thin);
    this.eraserMode.set(false);
  }

  public toggleEraser(): void {
    this.eraserMode.set(!this.eraserMode());
  }

  public clear(): void {
    this.painter.clear();
  }

  public submit(): void {
    const dataUrl = this.painter.toDataURL();
    if (dataUrl) {
      this.avatarSubmitted.emit(dataUrl);
    }
  }
}
