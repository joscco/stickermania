import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../core/world.store";
import type {StickerCollage, StickerCollageModeState, StickerCollageVoteResult} from "@birthday/shared";

/**
 * Board/TV display for the sticker-collage game.
 * Shows current prompt, submissions from last round, vote results, etc.
 */
@Component({
    selector: "app-sticker-board-scene",
    standalone: true,
    imports: [CommonModule],
    templateUrl: "./sticker-board-scene.component.html",
})
export class StickerBoardSceneComponent {
    private readonly worldStore = inject(WorldStore);

    public readonly modeState = computed<StickerCollageModeState | null>(() => {
        return this.worldStore.stickerCollageModeState();
    });

    public readonly lastVoteResults = computed<StickerCollageVoteResult[]>(() => {
        const modeState = this.modeState();
        if (modeState) {
            return modeState.lastVoteResults;
        } else {
            return [];
        }
    });

    public readonly topResults = computed(() => {
        return this.lastVoteResults().slice(0, 3);
    });

    public readonly currentRoundSubmissionCount = computed(() => {
        const modeState = this.modeState();
        if (!modeState) {
            return 0;
        }
        const currentRoundSubmissions = modeState.submissions[modeState.currentRoundIndex];
        if (!currentRoundSubmissions) {
            return 0;
        }
        return currentRoundSubmissions.length;
    });

    public readonly playerCount = computed(() => {
        return Object.values(this.worldStore.players()).filter(player => player.connected).length;
    });

    private stickerCatalogMap = new Map<string, {imageUrl: string}>();

    public getStickerUrl(stickerId: string): string {
        const modeState = this.modeState();
        if (!modeState) {
            return "";
        }
        if (this.stickerCatalogMap.size !== modeState.stickerCatalog.length) {
            this.stickerCatalogMap.clear();
            for (const sticker of modeState.stickerCatalog) {
                this.stickerCatalogMap.set(sticker.id, sticker);
            }
        }
        return this.stickerCatalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public getPlayerName(playerId: string): string {
        const player = this.worldStore.players()[playerId];
        if (player) {
            return player.name;
        } else {
            return "Anonym";
        }
    }

    public getCollage(collageId: string): StickerCollage | undefined {
        const modeState = this.modeState();
        if (!modeState) {
            return undefined;
        }
        // Search across all rounds
        for (const roundSubmissions of Object.values(modeState.submissions)) {
            const foundCollage = roundSubmissions.find(collage => collage.id === collageId);
            if (foundCollage) {
                return foundCollage;
            }
        }
        return undefined;
    }
}
