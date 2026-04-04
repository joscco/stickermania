import {inject, Injectable} from "@angular/core";
import type {TeamGraffitiServerEvent} from "@birthday/shared";
import {GameSessionStore} from "../../../core/challenge.store";

/**
 * Handles team-graffiti game events and reconnect state-sync.
 */
@Injectable()
export class GraffitiEventHandler {
    private readonly sessionStore = inject(GameSessionStore);

    public handleEvent(event: TeamGraffitiServerEvent): void {
        switch (event.type) {
            case "team-assigned":
                if (event.playerId === this.sessionStore.playerId()) {
                    const label = event.teamId === "DIAMOND" ? "♦️ Karo" : "♥️ Herz";
                    this.sessionStore.showFeedback(`Du bist jetzt Team ${label}.`, "success");
                }
                break;
            case "house-tagged":
            case "team-score-updated":
            case "actions-updated":
                break;
        }
    }

    public syncMode(): void {
        this.sessionStore.clearTask("TEAM_GRAFFITI");
    }
}

