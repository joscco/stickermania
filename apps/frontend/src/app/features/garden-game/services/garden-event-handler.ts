import {inject, Injectable} from "@angular/core";
import type {GardenServerEvent} from "@birthday/shared";
import {GameSessionStore} from "../../../core/challenge.store";
import {GardenPlayerService} from "./garden-player.service";

/**
 * Handles garden-coop game events and reconnect state-sync.
 */
@Injectable()
export class GardenEventHandler {
    private readonly sessionStore = inject(GameSessionStore);
    private readonly gardenService = inject(GardenPlayerService);

    public handleEvent(event: GardenServerEvent): void {
        switch (event.type) {
            case "garden-level-up":
                this.sessionStore.showFeedback(`Level ${event.newLevel} erreicht!`, "success");
                break;
            case "garden-plot-ready":
                this.sessionStore.showFeedback(`${this.gardenService.plantName(event.plantId)} ist erntereif.`, "success");
                break;
            case "garden-plot-needs-water":
                this.sessionStore.showFeedback(`${this.gardenService.plantName(event.plantId)} braucht Wasser.`, "error");
                break;
            case "garden-pest-spawned":
                this.sessionStore.showFeedback(`Ungeziefer bei ${this.gardenService.plantName(event.plantId)}.`, "error");
                break;
            case "garden-order-fulfilled":
                this.sessionStore.showFeedback(`Auftrag erfüllt (+${event.experienceGained} XP).`, "success");
                break;
        }
    }

    public syncMode(): void {
        this.sessionStore.clearTask("GARDEN");
    }
}

