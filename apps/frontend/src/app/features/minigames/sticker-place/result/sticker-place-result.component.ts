import {Component, input, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {StickerPlaceSubmission, StickerPlaceTask} from "@birthday/shared";

@Component({
  selector: "app-sticker-place-result",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./sticker-place-result.component.html",
  host: {"class": "w-full max-w-[320px] aspect-square bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col"},
})
export class StickerPlaceResultComponent {
  readonly submission = input.required<StickerPlaceSubmission>();
  readonly task = input.required<StickerPlaceTask>();
  readonly playerName = input("");
  readonly placement = input<number | null>(null);
  readonly isWinner = input(false);

  readonly dotsSvg = computed(() => {
    const dots = this.submission().positions.map(p =>
      `<circle cx="${(p.x * 2).toFixed(1)}" cy="${(p.y * 2).toFixed(1)}" r="6" fill="black"/>`
    ).join('');
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" fill="#f9f9f9"><rect width="200" height="200" fill="#f9f9f9"/>${dots}</svg>`
    )}`;
  });
}
