import { Component, output, signal } from "@angular/core";

@Component({
  selector: "app-lobby-name",
  standalone: true,
  template: `
    <div class="h-full flex items-center justify-center p-4">
      <div class="w-full max-w-sm">
        <div class="text-center mb-6">
          <img src="assets/icons/cake.svg" class="w-12 h-12 mx-auto mb-2" alt=""/>
          <h1 class="text-xl font-bold">Willkommen!</h1>
          <p class="text-sm text-stone-500 mt-1">Gib deinen Namen ein, um mitzuspielen</p>
        </div>
        <input
          class="w-full rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-center text-lg outline-none focus:border-stone-400"
          placeholder="Dein Name"
          [value]="nameInput()"
          (input)="nameInput.set(($any($event.target).value ?? ''))"
          (keydown.enter)="submit()"
          maxlength="24"
        />
        <button
          class="mt-3 w-full rounded-2xl bg-stone-900 text-white px-4 py-3 text-sm font-medium hover:bg-stone-800 active:translate-y-px disabled:opacity-40"
          [disabled]="nameInput().trim().length === 0"
          (click)="submit()"
        >Weiter →</button>
      </div>
    </div>
  `,
})
export class LobbyNameComponent {
  public readonly nameInput = signal("");
  public readonly nameSubmitted = output<string>();

  public submit(): void {
    const name = this.nameInput().trim();
    if (name.length > 0) {
      this.nameSubmitted.emit(name);
    }
  }
}

