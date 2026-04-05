import {Component, computed, inject} from "@angular/core";
import {CommonModule} from "@angular/common";
import {WorldStore} from "../../../core/world.store";
import {WebSocketService} from "../../../core/websocket.service";
import type {StickerCollage, StickerCollageModeState, StickerCollageVoteResult, StickerCollageClientAction} from "@birthday/shared";

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
    private readonly wsService = inject(WebSocketService);

    public readonly modeState = computed<StickerCollageModeState | null>(() => {
        return this.worldStore.stickerCollageModeState();
    });

    public readonly phase = computed(() => this.modeState()?.phase ?? "LOBBY");

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

    public readonly winnerId = computed(() => this.modeState()?.winnerId ?? null);
    public readonly winnerChoicesDone = computed(() => this.modeState()?.winnerChoicesDone ?? false);

    public readonly lastUnlockedPackName = computed(() => {
        const ms = this.modeState();
        if (!ms?.lastUnlockedPackId) return null;
        return ms.stickerPacks.find(p => p.id === ms.lastUnlockedPackId)?.name ?? null;
    });

    public readonly guaranteedPackName = computed(() => {
        const ms = this.modeState();
        if (!ms?.guaranteedPackId) return null;
        return ms.stickerPacks.find(p => p.id === ms.guaranteedPackId)?.name ?? null;
    });

    // ─── Helpers ─────────────────────────────────────────────────

    private stickerCatalogMap = new Map<string, {imageUrl: string}>();

    public getStickerUrl(stickerId: string): string {
        const modeState = this.modeState();
        if (!modeState) return "";
        if (this.stickerCatalogMap.size !== modeState.stickerCatalog.length) {
            this.stickerCatalogMap.clear();
            for (const sticker of modeState.stickerCatalog) {
                this.stickerCatalogMap.set(sticker.id, sticker);
            }
        }
        return this.stickerCatalogMap.get(stickerId)?.imageUrl ?? "";
    }

    public getPlayerName(playerId: string): string {
        return this.worldStore.players()[playerId]?.name ?? "Anonym";
    }

    public getCollage(collageId: string): StickerCollage | undefined {
        const ms = this.modeState();
        if (!ms) return undefined;
        for (const roundSubs of Object.values(ms.submissions)) {
            const found = roundSubs.find(c => c.id === collageId);
            if (found) return found;
        }
        return undefined;
    }

    // ─── Board actions ───────────────────────────────────────────

    public startGame(): void {
        this.sendAction({type: "start-game"});
    }

    public endRoundEarly(): void {
        this.sendAction({type: "end-round-early"});
    }

    public endVotingEarly(): void {
        this.sendAction({type: "end-voting-early"});
    }

    public advanceFromResults(): void {
        this.sendAction({type: "advance-from-results"});
    }

    private sendAction(action: StickerCollageClientAction): void {
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }
}
