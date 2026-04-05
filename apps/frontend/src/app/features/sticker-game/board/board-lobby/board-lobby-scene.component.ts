import {Component, computed, inject, input} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../../core/world.store";
import {WebSocketService} from "../../../../core/websocket.service";
import type {StickerCollageClientAction, SessionPlayer} from "@birthday/shared";

@Component({
    selector: "app-board-lobby-scene",
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="h-full flex flex-col items-center justify-center gap-8">
            <!-- Title -->
            <div class="text-center">
                <div class="text-8xl mb-4">🎨</div>
                <h1 class="text-5xl font-black text-stone-800">Sticker-Collage</h1>
            </div>

            <!-- Connected players -->
            <div class="flex flex-wrap justify-center gap-3 max-w-2xl">
                @for (player of connectedPlayers(); track player.id) {
                    <div class="flex flex-col items-center gap-1">
                        <div class="w-16 h-16 rounded-2xl border-2 bg-stone-100 shadow-md overflow-hidden grid place-items-center text-2xl"
                             [class.border-emerald-400]="player.connected"
                             [class.border-stone-200]="!player.connected">
                            @if (player.avatarUrl) {
                                <img [src]="player.avatarUrl" [alt]="player.name"
                                     class="w-full h-full object-cover"
                                     (error)="$any($event.target).style.display='none'" />
                            } @else {
                                🙂
                            }
                        </div>
                        <span class="text-xs font-medium text-stone-600 max-w-16 truncate">{{ player.name || 'Spieler' }}</span>
                    </div>
                }
            </div>

            <p class="text-xl text-stone-500">{{ connectedPlayers().length }} Spieler verbunden</p>

            <!-- QR codes + session code -->
            <div class="flex items-center gap-6">
                @if (playerQrDataUrl()) {
                    <img [src]="playerQrDataUrl()!" alt="QR"
                         class="w-32 h-32 rounded-2xl border border-black/10 bg-white p-1 shadow-lg" />
                }
                <div class="text-center">
                    <div class="text-xs uppercase tracking-widest text-stone-400 font-semibold">Session-Code</div>
                    <div class="text-4xl font-black tracking-[0.25em] text-stone-900 mt-1">{{ sessionCode() }}</div>
                </div>
                @if (wifiQrDataUrl()) {
                    <img [src]="wifiQrDataUrl()!" alt="WLAN QR"
                         class="w-32 h-32 rounded-2xl border border-black/10 bg-white p-1 shadow-lg" />
                }
            </div>

            <!-- Start button -->
            <button
                class="bg-purple-600 text-white px-10 py-5 rounded-2xl text-2xl font-bold shadow-xl hover:bg-purple-700 active:scale-95 transition-all"
                (click)="startGame()"
            >
                Spiel starten 🚀
            </button>
        </div>
    `,
})
export class BoardLobbySceneComponent {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);

    public readonly sessionCode = input<string | null>(null);
    public readonly playerQrDataUrl = input<string | null>(null);
    public readonly wifiQrDataUrl = input<string | null>(null);

    public readonly connectedPlayers = computed<SessionPlayer[]>(() => {
        return Object.values(this.worldStore.players()).filter(p => p.connected);
    });

    public startGame(): void {
        const action: StickerCollageClientAction = {type: "start-game"};
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}

