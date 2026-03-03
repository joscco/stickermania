import { Component, input } from "@angular/core";

@Component({
  selector: "app-idle-search-waiting",
  standalone: true,
  template: `
    <div class="h-full flex flex-col items-center justify-center p-4">
      <img src="assets/icons/search.svg" class="w-12 h-12 mb-3 opacity-40" alt=""/>
      <h2 class="text-lg font-semibold">Keine Zeichnungen zum Suchen</h2>
      <p class="text-xs text-stone-500 mt-1">Es gibt gerade keine Bilder, die du finden kannst.</p>
      <p class="text-xs text-stone-400 mt-1">Warte auf die nächste Runde…</p>
      @if (timeLeft()) {
        <div class="mt-3 text-sm font-mono font-bold text-stone-600 bg-stone-200 px-3 py-1 rounded-lg inline-flex items-center gap-1">
          <img src="assets/icons/timer.svg" class="w-3 h-3" alt=""/> {{ timeLeft() }}
        </div>
      }
    </div>
  `,
})
export class IdleSearchWaitingComponent {
  public readonly timeLeft = input<string>("");
}

