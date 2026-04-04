import {inject, Injectable} from "@angular/core";
import type {StickerCollageServerEvent} from "@birthday/shared";
import {GameSessionStore} from "../../../core/challenge.store";
import {WorldStore} from "../../../core/world.store";

/**
 * Handles sticker-collage game events and reconnect state-sync.
 */
@Injectable()
export class StickerEventHandler {
    private readonly sessionStore = inject(GameSessionStore);
    private readonly worldStore = inject(WorldStore);

    public handleEvent(event: StickerCollageServerEvent): void {
        switch (event.type) {
            case "hand-dealt":
                if (event.targetPlayerId === this.sessionStore.playerId()) {
                    this.sessionStore.showFeedback("Deine Sticker-Hand ist da! 🎨", "success");
                }
                break;
            case "round-started":
                this.sessionStore.showFeedback(`Neue Runde: ${event.prompt}`, "success");
                break;
            case "collage-submitted": {
                const players = this.worldStore.players();
                const name = players[event.playerId]?.name ?? "Jemand";
                if (event.playerId !== this.sessionStore.playerId()) {
                    this.sessionStore.showFeedback(`${name} hat eingereicht! 🖼️`, "success");
                }
                break;
            }
            case "vote-registered":
                break;
            case "round-ended":
                break;
            case "score-update":
                if (event.playerId === this.sessionStore.playerId()) {
                    this.sessionStore.showFeedback(`Du hast jetzt ${event.newScore} Punkte! ⭐`, "success");
                }
                break;
        }
    }

    public syncMode(): void {
        this.sessionStore.clearTask("STICKER_COLLAGE");
    }
}

