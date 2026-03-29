import {
  Component, ElementRef, ViewChild, AfterViewInit,
  input, output, signal,
} from "@angular/core";
import {CanvasPainter} from '../../../player/shared/canvas-painter';

@Component({
  selector: "app-draw",
  standalone: true,
  templateUrl: './draw.component.html',
})
export class DrawComponent implements AfterViewInit {
  public readonly prompt = input.required<string>();
  public readonly drawIndex = input.required<number>();
  public readonly drawTotal = input.required<number>();
  public readonly timeLeft = input<string>("");

  public readonly drawingSubmitted = output<string>();

  @ViewChild("drawCanvas") canvasRef!: ElementRef<HTMLCanvasElement>;

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
      this.drawingSubmitted.emit(dataUrl);
    }
  }
}

