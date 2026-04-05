import {inject, Injectable} from "@angular/core";
import type {StickerCollageServerEvent} from "@birthday/shared";
import {WorldStore} from '../../../core/world.store';
import {GameSessionStore} from '../../../core/challenge.store';

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
            case "game-started":
                this.sessionStore.showFeedback("Das Spiel beginnt! 🎉", "success");
                break;
            case "round-started":
                this.sessionStore.showFeedback(`Runde ${event.roundIndex}: ${event.prompt}`, "success");
                break;
            case "collage-submitted": {
                const players = this.worldStore.players();
                const name = players[event.playerId]?.name ?? "Jemand";
                if (event.playerId !== this.sessionStore.playerId()) {
                    this.sessionStore.showFeedback(`${name} hat eingereicht! 🖼️`, "success");
                }
                break;
            }
            case "voting-started":
                this.sessionStore.showFeedback("Abstimmung gestartet! 🗳️", "success");
                break;
            case "vote-registered":
                break;
            case "results-ready":
                this.sessionStore.showFeedback("Ergebnisse sind da! 🏆", "success");
                break;
            case "pack-unlocked":
                this.sessionStore.showFeedback(`${event.packName} freigeschaltet! 🔓`, "success");
                break;
            case "prompt-chosen":
                this.sessionStore.showFeedback(`Nächster Prompt: ${event.prompt}`, "success");
                break;
            case "guaranteed-pack-chosen":
                this.sessionStore.showFeedback(`${event.packName} ist auf jeden Fall dabei! ⭐`, "success");
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
