import {Component, computed, inject, input, signal} from "@angular/core";
import {CommonModule} from "@angular/common";
import type {
    StickerCollageClientAction,
    StickerCollageModeState,
    StickerCollageVoteResult,
    SessionPlayer,
} from "@birthday/shared";
import JSZip from "jszip";
import {WorldStore} from '../../../../../core/world.store';
import {WebSocketService} from '../../../../../core/websocket.service';
import {ApiService} from '../../../../../core/api.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';

@Component({
    selector: "app-board-results-scene",
    standalone: true,
    imports: [CommonModule, AnimOnInitDirective],
    templateUrl: "./board-results-scene.component.html",
})
export class BoardResultsSceneComponent {
    private readonly worldStore = inject(WorldStore);
    private readonly wsService = inject(WebSocketService);
    private readonly apiService = inject(ApiService);

    public readonly modeState = input<StickerCollageModeState | null>(null);

    public readonly downloadState = signal<"idle" | "loading" | "done" | "error">("idle");

    public readonly topResults = computed<StickerCollageVoteResult[]>(() => {
        return (this.modeState()?.lastVoteResults ?? []).slice(0, 3);
    });

    public readonly winnerId = computed(() => this.modeState()?.winnerId ?? null);
    public readonly winnerChoicesDone = computed(() => this.modeState()?.winnerChoicesDone ?? false);

    /** Check if winner already chose the prompt (stored in promptHistory for next round) */
    public readonly promptChosen = computed(() => {
        const ms = this.modeState();
        if (!ms) return false;
        return !!ms.promptHistory[ms.currentRoundIndex + 1];
    });

    /** Check if winner already unlocked a pack */
    public readonly packUnlocked = computed(() => {
        return !!this.modeState()?.lastUnlockedPackId;
    });

    /** Check if winner already chose the guaranteed pack (winnerChoicesDone is set when guaranteed is picked) */
    public readonly guaranteedChosen = computed(() => {
        return this.modeState()?.winnerChoicesDone ?? false;
    });

    public getPlayer(playerId: string): SessionPlayer | undefined {
        return this.worldStore.players()[playerId];
    }

    public advanceFromResults(): void {
        const action: StickerCollageClientAction = {type: "advance-from-results"};
        this.wsService.send({type: "game-action", mode: "sticker-collage", action});
    }

    public async downloadAllAssets(): Promise<void> {
        const sessionId = this.worldStore.sessionState()?.sessionId;
        if (!sessionId) return;

        this.downloadState.set("loading");
        try {
            const assets = await this.apiService.getSessionAssets(sessionId);
            const zip = new JSZip();

            await Promise.all(assets.map(async (asset) => {
                const response = await fetch(asset.publicUrl);
                const blob = await response.blob();
                const folder = asset.type === "avatar" ? "avatare" : "collagen";
                zip.file(`${folder}/${asset.filename}`, blob);
            }));

            const content = await zip.generateAsync({type: "blob"});
            const url = URL.createObjectURL(content);
            const a = document.createElement("a");
            a.href = url;
            a.download = `stickermania-${sessionId.slice(0, 8)}.zip`;
            a.click();
            URL.revokeObjectURL(url);
            this.downloadState.set("done");
        } catch {
            this.downloadState.set("error");
        }
    }
}
