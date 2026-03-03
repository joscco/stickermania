import { Component, input } from "@angular/core";

@Component({
  selector: "app-lobby-ready",
  standalone: true,
  template: `
    <div class="h-full flex flex-col items-center justify-center p-4">
      <img src="assets/icons/checkmark.svg" class="w-14 h-14 mb-3" alt=""/>
      <h2 class="text-lg font-semibold">Bereit!</h2>
      <p class="text-sm text-stone-500 mt-1">{{ playerName() }}, du bist angemeldet.</p>
      <p class="text-xs text-stone-400 mt-2">Warte auf den Rundenstart…</p>
    </div>
  `,
})
export class LobbyReadyComponent {
  public readonly playerName = input.required<string>();
}

