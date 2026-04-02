import { Component, inject, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import type { DrawSearchGuessTask } from "@birthday/shared";
import { FramedDrawingComponent } from "../../shared/framed-drawing.component";

@Component({
  selector: "app-guess",
  standalone: true,
  imports: [CommonModule, FramedDrawingComponent],
  template: `
    <div class="h-full flex flex-col items-center justify-center p-4 gap-4 overflow-auto">
      <div class="text-xs text-stone-400 uppercase tracking-wider">
        🤔 Welcher Titel ist echt?
      </div>

      <!-- The drawing in a frame -->
      <div class="shrink-0">
        <app-framed-drawing
          [drawing]="{ id: task().drawingId, artistId: '', prompt: '', imageUrl: task().imageUrl, imageAssetPath: '', placedAt: 0 }"
          [sizePx]="180"
          [animateIn]="true"
        />
      </div>

      <div class="text-xs text-stone-400">Gemalt von {{ task().artistName }}</div>

      <div class="text-sm font-semibold text-stone-700 text-center">
        Welcher Titel ist echt?
      </div>

      <!-- Caption options -->
      <div class="w-full max-w-xs space-y-2">
        @for (caption of task().captions; track caption.id) {
          <button
            class="w-full rounded-xl border px-4 py-3 text-sm text-left transition-all active:scale-[0.97]"
            [class.border-black/10]="!selectedId()"
            [class.bg-white]="!selectedId()"
            [class.hover:bg-stone-50]="!selectedId()"
            [class.border-emerald-400]="selectedId() === caption.id && wasCorrect()"
            [class.bg-emerald-50]="selectedId() === caption.id && wasCorrect()"
            [class.border-red-400]="selectedId() === caption.id && !wasCorrect()"
            [class.bg-red-50]="selectedId() === caption.id && !wasCorrect()"
            [class.opacity-50]="!!selectedId() && selectedId() !== caption.id"
            [class.pointer-events-none]="!!selectedId()"
            (click)="selectCaption(caption.id)"
          >
            {{ caption.text }}
          </button>
        }
      </div>

      @if (selectedId()) {
        <div class="text-sm font-medium" [class.text-emerald-600]="wasCorrect()" [class.text-red-500]="!wasCorrect()">
          {{ wasCorrect() ? 'Richtig! 🎉' : 'Falsch!' }}
        </div>
      }
    </div>
  `,
})
export class GuessComponent {
  public readonly task = input.required<DrawSearchGuessTask>();
  public readonly guessSubmitted = output<{ drawingId: string; captionId: string }>();

  public readonly selectedId = signal<string | null>(null);
  public readonly wasCorrect = signal<boolean>(false);

  public selectCaption(captionId: string): void {
    if (this.selectedId()) return; // Already selected
    this.selectedId.set(captionId);

    // We won't know if it's correct from here — the server tells us via guess-result event.
    // For now just submit and the parent will handle feedback.
    this.guessSubmitted.emit({ drawingId: this.task().drawingId, captionId });
  }

  /** Called by parent to reset state when a new task arrives. */
  public reset(): void {
    this.selectedId.set(null);
    this.wasCorrect.set(false);
  }
}

