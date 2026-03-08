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
  public readonly colors = input.required<string[]>();

  public readonly avatarSubmitted = output<string>();
  public readonly skipped = output<void>();

  @ViewChild("canvas") canvasRef!: ElementRef<HTMLCanvasElement>;

  public readonly currentColor = signal("#dc2626");
  public readonly brushThin = signal(true);

  public readonly painter = new CanvasPainter(
    () => this.canvasRef?.nativeElement,
    () => this.currentColor(),
    () => this.brushThin() ? 3 : 10,
  );

  public ngAfterViewInit(): void {
    setTimeout(() => this.painter.init(), 50);
  }

  public selectColor(color: string): void {
    this.currentColor.set(color);
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
