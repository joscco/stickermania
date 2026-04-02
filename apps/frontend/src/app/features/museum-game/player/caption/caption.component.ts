import { Component, inject, input, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import type { DrawSearchCaptionTask } from "@birthday/shared";
import { FramedDrawingComponent } from "../../shared/framed-drawing.component";

@Component({
  selector: "app-caption",
  standalone: true,
  imports: [CommonModule, FormsModule, FramedDrawingComponent],
  template: `
    <div class="h-full flex flex-col items-center justify-center p-4 gap-4 overflow-auto">
      <div class="text-xs text-stone-400 uppercase tracking-wider">
        ✍️ Fake-Titel schreiben
      </div>

      <!-- The drawing in a frame -->
      <div class="shrink-0">
        <app-framed-drawing
          [drawing]="{ id: task().drawingId, artistId: '', prompt: '', imageUrl: task().imageUrl, imageAssetPath: '', placedAt: 0 }"
          [sizePx]="180"
          [animateIn]="true"
        />
      </div>

      <div class="text-sm text-stone-500 text-center max-w-xs">
        Schreib einen lustigen Fake-Titel für dieses Bild!<br/>
        Die anderen müssen dann den echten Titel erraten.
      </div>

      <!-- Text input -->
      <div class="w-full max-w-xs">
        <input
          type="text"
          [(ngModel)]="captionText"
          (keydown.enter)="submit()"
          placeholder="Dein Fake-Titel..."
          maxlength="80"
          class="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-amber-400/50"
        />
      </div>

      <button
        class="rounded-xl bg-amber-500 text-white font-semibold px-6 py-3 text-sm disabled:opacity-40 transition-all active:scale-95"
        [disabled]="captionText().trim().length === 0"
        (click)="submit()"
      >
        Absenden
      </button>
    </div>
  `,
})
export class CaptionComponent {
  public readonly task = input.required<DrawSearchCaptionTask>();
  public readonly captionSubmitted = output<{ drawingId: string; text: string }>();

  public readonly captionText = signal("");

  public submit(): void {
    const text = this.captionText().trim();
    if (text.length === 0) return;
    this.captionSubmitted.emit({ drawingId: this.task().drawingId, text });
    this.captionText.set("");
  }
}

