import {Component} from "@angular/core";
import {RouterModule} from "@angular/router";

@Component({
    selector: "app-dev-landing",
    standalone: true,
    imports: [RouterModule],
    template: `
        <div class="h-screen bg-stone-50 flex flex-col items-center justify-center gap-8 p-8">
            <h1 class="text-4xl font-black text-stone-800">🛠️ Dev-Modus</h1>
            <p class="text-stone-500">Wähle einen Editor:</p>
            <div class="flex gap-4">
                <a routerLink="/editor"
                   class="bg-purple-600 text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl hover:bg-purple-700 active:scale-95 transition-all">
                    🎨 Sticker-Editor
                </a>
                <a routerLink="/hitbox-editor"
                   class="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl hover:bg-emerald-700 active:scale-95 transition-all">
                    📐 Hitbox-Editor
                </a>
            </div>
        </div>
    `,
})
export class DevLandingComponent {}

