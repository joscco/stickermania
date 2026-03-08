import {
  Component, ElementRef, ViewChild, AfterViewInit,
  input, output, signal,
} from "@angular/core";
import { CanvasPainter } from "../shared/canvas-painter";

@Component({
  selector: "app-draw",
  standalone: true,
  template: `
    <div class="h-full flex flex-col items-center">
      <!-- Prompt + Timer -->
      <div class="text-center py-2 px-4">
        <div class="text-xs text-stone-400 uppercase tracking-wider">Zeichne ({{ drawIndex() + 1 }}/{{ drawTotal() }}):</div>
        <div class="text-2xl font-bold">{{ prompt() }}</div>
        @if (timeLeft()) {
          <div class="text-xs font-mono text-stone-500 mt-0.5 inline-flex items-center gap-1">
            <img src="assets/icons/timer.svg" class="w-3 h-3" alt=""/> {{ timeLeft() }}
          </div>
        }
      </div>

      <!-- Square canvas fills available space -->
      <div class="flex-1 flex items-center justify-center px-2 w-full min-h-0">
        <div class="relative rounded-2xl border-2 border-black/[0.06] overflow-hidden bg-white aspect-square no-select"
             style="width: min(95vw, calc(100dvh - 260px));">
          <canvas #drawCanvas class="w-full h-full" style="touch-action: none;"
                  (pointerdown)="painter.pointerDown($event)"
                  (pointermove)="painter.pointerMove($event)"
                  (pointerup)="painter.pointerUp()"
                  (pointercancel)="painter.pointerUp()"
          ></canvas>
        </div>
      </div>

      <!-- Tools: safe-area padding at bottom for Safari toolbar -->
      <div class="px-3 pt-2 space-y-2 w-full max-w-md mx-auto"
           style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
        <div class="flex items-center justify-center gap-3">
          @for (color of colors(); track color) {
            <button class="w-10 h-10 rounded-full border-3 transition-transform"
                    [style.background]="color"
                    [class.border-stone-900]="currentColor() === color"
                    [class.scale-110]="currentColor() === color"
                    [class.border-transparent]="currentColor() !== color"
                    [class.ring-2]="currentColor() === color"
                    [class.ring-stone-400]="currentColor() === color"
                    (click)="selectColor(color)"></button>
          }
          <div class="flex bg-stone-200 rounded-lg overflow-hidden ml-3">
            <button class="px-3 py-1.5 text-xs font-medium transition-colors"
                    [class.bg-stone-900]="brushThin()" [class.text-white]="brushThin()"
                    (click)="brushThin.set(true)">Dünn</button>
            <button class="px-3 py-1.5 text-xs font-medium transition-colors"
                    [class.bg-stone-900]="!brushThin()" [class.text-white]="!brushThin()"
                    (click)="brushThin.set(false)">Dick</button>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm hover:bg-stone-50 inline-flex items-center justify-center gap-1" (click)="clear()">
            <img src="assets/icons/trash.svg" class="w-4 h-4" alt=""/> Löschen
          </button>
          <button class="flex-1 rounded-xl bg-emerald-600 text-white px-3 py-2.5 text-sm font-medium hover:bg-emerald-700 active:translate-y-px inline-flex items-center justify-center gap-1" (click)="submit()">
            <img src="assets/icons/checkmark.svg" class="w-4 h-4 invert" alt=""/> Fertig
          </button>
        </div>
      </div>
    </div>
  `,
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

