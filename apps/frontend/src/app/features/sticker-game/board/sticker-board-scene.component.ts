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
        return this.modeState()?.lastVoteResults ?? [];
    });

    public readonly topResults = computed(() => {
        return this.lastVoteResults().slice(0, 3);
    });

    public readonly currentRoundSubmissionCount = computed(() => {
        const ms = this.modeState();
        if (!ms) return 0;
        return (ms.submissions[ms.currentRoundIndex] ?? []).length;
    });

    public readonly playerCount = computed(() => {
        return Object.values(this.worldStore.players()).filter(p => p.connected).length;
    });

    private catalogMap = new Map<string, {imageUrl: string}>();

    public getStickerUrl(stickerId: string): string {
        const ms = this.modeState();
        if (!ms) return "";
        if (this.catalogMap.size !== ms.stickerCatalog.length) {
            this.catalogMap.clear();
            for (const s of ms.stickerCatalog) {
                this.catalogMap.set(s.id, s);
            }
        }
        return this.catalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public getPlayerName(playerId: string): string {
        return this.worldStore.players()[playerId]?.name ?? "Anonym";
    }

    public getCollage(collageId: string): StickerCollage | undefined {
        const ms = this.modeState();
        if (!ms) return undefined;
        // Search across all rounds
        for (const roundSubs of Object.values(ms.submissions)) {
            const found = roundSubs.find(c => c.id === collageId);
            if (found) return found;
        }
        return undefined;
    }
}

