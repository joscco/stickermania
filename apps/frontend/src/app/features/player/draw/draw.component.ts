import {
  Component, ElementRef, ViewChild, AfterViewInit,
  input, output, signal,
} from "@angular/core";
import { CanvasPainter } from "../shared/canvas-painter";

@Component({
  selector: "app-draw",
  standalone: true,
  templateUrl: './draw.component.html',
})
export class DrawComponent implements AfterViewInit {
  public readonly prompt = input.required<string>();
  public readonly drawIndex = input.required<number>();
  public readonly drawTotal = input.required<number>();
  public readonly colors = input.required<string[]>();
  public readonly timeLeft = input<string>("");

  public readonly drawingSubmitted = output<string>();

  @ViewChild("drawCanvas") canvasRef!: ElementRef<HTMLCanvasElement>;

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
      this.drawingSubmitted.emit(dataUrl);
    }
  }
}

